pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { ReentrancyGuard } from "zeppelin-solidity/contracts/ReentrancyGuard.sol";
import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { ERC721Token } from "zeppelin-solidity/contracts/token/ERC721/ERC721Token.sol";
import { Margin } from "../Margin.sol";
import { TokenInteract } from "../../lib/TokenInteract.sol";
import { ForceRecoverCollateralDelegator } from "../interfaces/ForceRecoverCollateralDelegator.sol";
import { LoanOwner } from "../interfaces/LoanOwner.sol";
import { MarginCallDelegator } from "../interfaces/MarginCallDelegator.sol";


/**
 * @title ERC721MarginLoan
 * @author dYdX
 *
 * Contract used to tokenize margin loans as ERC721-compliant non-fungible tokens. Holding the
 * token allows the holder to margin-call the position and be entitled to all payouts. Functionality
 * is added to let users approve other addresses margin-call positions for them. Allows any position
 * to be force-recovered by anyone as long as the payout goes to the owner of the token.
 */
 /* solium-disable-next-line */
contract ERC721MarginLoan is
    ERC721Token,
    MarginCallDelegator,
    ForceRecoverCollateralDelegator,
    ReentrancyGuard
{
    using SafeMath for uint256;

    // ============ Events ============

    event MarginCallerApproval(
        address indexed lender,
        address indexed approved,
        bool isApproved
    );

    event OwedTokenWithdrawn(
        bytes32 indexed positionId,
        address indexed lender,
        address owedToken,
        uint256 owedTokenWithdrawn
    );

    // ============ State Variables ============

    // Mapping from an address to other addresses that are approved to be margin-callers
    mapping (address => mapping (address => bool)) public approvedCallers;

    // Mapping from a positionId to the total number of owedToken ever repaid to the lender for the
    // position. Updated only upon acquiring the loan or upon withdrawing owedToken from this
    // contract for the given positionId.
    mapping (bytes32 => uint256) public owedTokensRepaidSinceLastWithdraw;

    // Mapping from a positionId to the address of the owedToken of that position. Needed because
    // margin erases this information when the position is closed.
    mapping (bytes32 => address) public owedTokenAddress;

    // ============ Constructor ============

    function ERC721MarginLoan(
        address margin
    )
        public
        ERC721Token("dYdX ERC721 Margin Loans", "d/LO")
        MarginCallDelegator(margin)
        ForceRecoverCollateralDelegator(margin)
    {
    }

    // ============ Token-Holder functions ============

    /**
     * Approves an address to margin-call any of the positions owned by the sender.
     *
     * @param  caller      Address of the margin-caller
     * @param  isApproved  True if approving the caller, false if revoking approval
     */
    function approveCaller(
        address caller,
        bool isApproved
    )
        external
        nonReentrant
    {
        // cannot approve self since any address can already close its own positions
        require(caller != msg.sender);

        // do nothing if state does not need to change
        if (approvedCallers[msg.sender][caller] == isApproved) {
            return;
        }

        approvedCallers[msg.sender][caller] = isApproved;

        emit MarginCallerApproval(
            msg.sender,
            caller,
            isApproved
        );
    }

    /**
     * Transfer ownership of the loan externally to this contract, thereby burning the token.
     * Requires that there is no owedToken held in this contract for the loan being transferred
     * because once the loan is untokenized, there is no way for the lender to withdraw the tokens
     * from this contract.
     *
     * @param  positionId  Unique ID of the position
     * @param  to          Address to transfer loan ownership to
     */
    function untokenizeLoan(
        bytes32 positionId,
        address to
    )
        external
        nonReentrant
    {
        uint256 tokenId = uint256(positionId);
        address owner = ownerOf(tokenId);
        require(msg.sender == owner);

        // require no un-withdrawn owedToken
        uint256 totalRepaid = Margin(DYDX_MARGIN).getTotalOwedTokenRepaidToLender(positionId);
        require(totalRepaid == owedTokensRepaidSinceLastWithdraw[positionId]);

        burnPositionToken(owner, positionId);
        Margin(DYDX_MARGIN).transferLoan(positionId, to);
    }

    /**
     * Helper to allow withdrawal for multiple positions in one call
     *
     * @param  positionIds  Array of positions to withdraw for
     */
    function withdrawMultiple(
        bytes32[] positionIds
    )
        external
        nonReentrant
    {
        for (uint256 i = 0; i < positionIds.length; i++) {
            withdrawImpl(positionIds[i]);
        }
    }

    /**
     * Withdraw the owedToken repaid for a loan
     *
     * @param  positionId  Unique ID of the position
     * @return             The amount of owedToken withdrawn
     */
    function withdraw(
        bytes32 positionId
    )
        external
        nonReentrant
        returns (uint256)
    {
        return withdrawImpl(positionId);
    }

    // ============ OnlyMargin Functions ============

    /**
     * Called by the Margin contract when anyone transfers ownership of a position to this contract.
     * This function mints a new ERC721 Token and returns this address to
     * indicate to Margin that it is willing to take ownership of the position.
     *
     * @param  from        Address of previous position owner
     * @param  positionId  Unique ID of the position
     * @return             This address on success, throw otherwise
     */
    function receiveLoanOwnership(
        address from,
        bytes32 positionId
    )
        external
        onlyMargin
        nonReentrant
        returns (address)
    {
        _mint(from, uint256(positionId));

        uint256 owedTokenRepaid = Margin(DYDX_MARGIN).getTotalOwedTokenRepaidToLender(positionId);
        if (owedTokenRepaid > 0) {
            owedTokensRepaidSinceLastWithdraw[positionId] = owedTokenRepaid;
        }

        owedTokenAddress[positionId] =
            Margin(DYDX_MARGIN).getPositionOwedToken(positionId);

        return address(this); // returning own address retains ownership of position
    }

    /**
     * Called by Margin when additional value is added onto a position. Rejects this addition.
     *
     *  param  from            Address that added the value to the position
     *  param  positionId      Unique ID of the position
     *  param  principalAdded  Principal amount added to position
     * @return                 False
     */
    function marginLoanIncreased(
        address, /* from */
        bytes32, /* positionId */
        uint256  /* principalAdded */
    )
        external
        /* pure */
        onlyMargin
        returns (bool)
    {
        return false;
    }

    /**
     * Called by Margin when another address attempts to margin-call a loan
     *
     * @param  who            Address attempting to initiate the loan call
     * @param  positionId     Unique ID of the position
     *  param  depositAmount  (unused)
     * @return                True to consent to the loan being called if the initiator is a trusted
     *                        loan caller or the owner of the loan
     */
    function marginCallOnBehalfOf(
        address who,
        bytes32 positionId,
        uint256 /* depositAmount */
    )
        external
        /* view */
        onlyMargin
        returns (bool)
    {
        address owner = ownerOf(uint256(positionId));
        return (who == owner) || approvedCallers[owner][who];
    }

    /**
     * Called by Margin when another address attempts to cancel a margin call for a loan
     *
     * @param  who         Address attempting to initiate the loan call cancel
     * @param  positionId  Unique ID of the position
     * @return             True to consent to the loan call being canceled if the initiator is a
     *                     trusted loan caller or the owner of the loan
     */
    function cancelMarginCallOnBehalfOf(
        address who,
        bytes32 positionId
    )
        external
        /* view */
        onlyMargin
        returns (bool)
    {
        address owner = ownerOf(uint256(positionId));
        return (who == owner) || approvedCallers[owner][who];
    }

    /**
     * Called by Margin when another address attempts to force recover the loan. Allow anyone to
     * force recover the loan as long as the payout goes to the token owner.
     *
     *  param  (unused)
     * @param  positionId           Unique ID of the position
     * @param  collateralRecipient  Address to send the recovered tokens to
     * @return                      True if forceRecoverCollateral() is permitted
     */
    function forceRecoverCollateralOnBehalfOf(
        address /* who */,
        bytes32 positionId,
        address collateralRecipient
    )
        external
        /* view */
        onlyMargin
        returns (bool)
    {
        return ownerOf(uint256(positionId)) == collateralRecipient;
    }

    // ============ Helper Functions ============

    /**
     * Implementation of withdrawing owedToken for a particular positionId
     *
     * @param  positionId  Unique ID of the position
     * @return             The number of owedToken withdrawn
     */
    function withdrawImpl(
        bytes32 positionId
    )
        internal
        returns (uint256)
    {
        address owner = ownerOf(uint256(positionId));
        require(owner != address(0));

        address owedToken = owedTokenAddress[positionId];
        uint256 totalRepaid = Margin(DYDX_MARGIN).getTotalOwedTokenRepaidToLender(positionId);
        uint256 tokensToSend = totalRepaid.sub(owedTokensRepaidSinceLastWithdraw[positionId]);

        if (tokensToSend == 0) {
            return 0;
        }

        // update state based on whether the position is closed or not
        if (Margin(DYDX_MARGIN).isPositionClosed(positionId)) {
            burnPositionToken(owner, positionId);
        } else {
            owedTokensRepaidSinceLastWithdraw[positionId] = totalRepaid;
        }

        assert(TokenInteract.balanceOf(owedToken, address(this)) >= tokensToSend);
        TokenInteract.transfer(owedToken, owner, tokensToSend);

        emit OwedTokenWithdrawn(
            positionId,
            owner,
            owedToken,
            tokensToSend
        );

        return tokensToSend;
    }

    /**
     * Burns the token and removes all unnecessary storage dedicated to that token.
     *
     * @param  positionId  Unique ID of the position
     */
    function burnPositionToken(
        address owner,
        bytes32 positionId
    )
        internal
    {
        delete owedTokensRepaidSinceLastWithdraw[positionId];
        delete owedTokenAddress[positionId];
        uint256 tokenId = uint256(positionId);

        // requires that owner actually is the owner of the token
        _burn(owner, tokenId);
    }
}
