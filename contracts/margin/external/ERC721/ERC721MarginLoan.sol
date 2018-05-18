/*

    Copyright 2018 dYdX Trading Inc.

    Licensed under the Apache License, Version 2.0 (the "License");
    you may not use this file except in compliance with the License.
    You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

    Unless required by applicable law or agreed to in writing, software
    distributed under the License is distributed on an "AS IS" BASIS,
    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
    See the License for the specific language governing permissions and
    limitations under the License.

*/

pragma solidity 0.4.23;
pragma experimental "v0.5.0";

import { ReentrancyGuard } from "zeppelin-solidity/contracts/ReentrancyGuard.sol";
import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { ERC721Token } from "zeppelin-solidity/contracts/token/ERC721/ERC721Token.sol";
import { Margin } from "../../Margin.sol";
import { TokenInteract } from "../../../lib/TokenInteract.sol";
/* solium-disable-next-line max-len*/
import { ForceRecoverCollateralDelegator } from "../../interfaces/ForceRecoverCollateralDelegator.sol";
import { LoanOwner } from "../../interfaces/LoanOwner.sol";
import { MarginCallDelegator } from "../../interfaces/MarginCallDelegator.sol";
import { OnlyMargin } from "../../interfaces/OnlyMargin.sol";


/**
 * @title ERC721MarginLoan
 * @author dYdX
 *
 * Contract used to tokenize margin loans as ERC721-compliant non-fungible tokens. Holding the
 * token allows the holder to margin-call the position and be entitled to all payouts. Functionality
 * is added to let users approve other addresses margin-call positions for them. Allows any position
 * to be force-recovered by anyone as long as the payout goes to the owner of the token.
 */
contract ERC721MarginLoan is
    ReentrancyGuard,
    ERC721Token,
    OnlyMargin,
    LoanOwner,
    MarginCallDelegator,
    ForceRecoverCollateralDelegator
{
    using SafeMath for uint256;

    // ============ Events ============

    /**
     * A token was created by transferring direct loan ownership to this contract.
     */
    event LoanTokenized(
        bytes32 indexed positionId,
        address indexed lender
    );

    /**
     * A token was burned from transferring direct loan ownership to an address other than
     * this contract.
     */
    event LoanUntokenized(
        bytes32 indexed positionId,
        address indexed lender,
        address ownershipSentTo
    );

    /**
     * Margin-calling approval was granted or revoked.
     */
    event MarginCallerApproval(
        address indexed lender,
        address indexed caller,
        bool isApproved
    );

    /**
     * OwedToken was withdrawn by a lender for a position.
     */
    event OwedTokenWithdrawn(
        bytes32 indexed positionId,
        address indexed lender,
        address owedToken,
        uint256 owedTokenWithdrawn,
        bool completelyRepaid
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

    constructor(
        address margin
    )
        public
        ERC721Token("dYdX ERC721 Margin Loans", "d/LO")
        OnlyMargin(margin)
    {}

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
        require(
            caller != msg.sender,
            "ERC721MarginLoan#approveCaller: Cannot approve self"
        );

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
        require(
            msg.sender == owner,
            "ERC721MarginLoan#untokenizeLoan: Only token owner can call"
        );

        // require no un-withdrawn owedToken
        uint256 totalRepaid = Margin(DYDX_MARGIN).getTotalOwedTokenRepaidToLender(positionId);
        require(
            totalRepaid == owedTokensRepaidSinceLastWithdraw[positionId],
            "ERC721MarginLoan#untokenizeLoan: All owedToken must be withdrawn before untokenization"
        );

        burnPositionToken(owner, positionId);
        Margin(DYDX_MARGIN).transferLoan(positionId, to);

        emit LoanUntokenized(positionId, owner, to);
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

        emit LoanTokenized(positionId, from);

        return address(this); // returning own address retains ownership of position
    }

    /**
     * Called by Margin when additional value is added onto a position. Rejects this addition.
     *
     *  param  payer           Address that added the value to the position
     *  param  positionId      Unique ID of the position
     *  param  principalAdded  Principal amount added to position
     * @return                 False
     */
    function marginLoanIncreased(
        address, /* payer */
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
     * @param  caller         Address attempting to initiate the loan call
     * @param  positionId     Unique ID of the position
     *  param  depositAmount  (unused)
     * @return                True to consent to the loan being called if the initiator is a trusted
     *                        loan caller or the owner of the loan
     */
    function marginCallOnBehalfOf(
        address caller,
        bytes32 positionId,
        uint256 /* depositAmount */
    )
        external
        /* view */
        onlyMargin
        returns (bool)
    {
        address owner = ownerOf(uint256(positionId));
        return (caller == owner) || approvedCallers[owner][caller];
    }

    /**
     * Called by Margin when another address attempts to cancel a margin call for a loan
     *
     * @param  canceler    Address attempting to initiate the loan call cancel
     * @param  positionId  Unique ID of the position
     * @return             True to consent to the loan call being canceled if the initiator is a
     *                     trusted loan caller or the owner of the loan
     */
    function cancelMarginCallOnBehalfOf(
        address canceler,
        bytes32 positionId
    )
        external
        /* view */
        onlyMargin
        returns (bool)
    {
        address owner = ownerOf(uint256(positionId));
        return (canceler == owner) || approvedCallers[owner][canceler];
    }

    /**
     * Called by Margin when another address attempts to force recover the loan. Allow anyone to
     * force recover the loan as long as the payout goes to the token owner.
     *
     *  param  (unused)
     * @param  positionId  Unique ID of the position
     * @param  recipient   Address to send the recovered tokens to
     * @return             True if forceRecoverCollateral() is permitted
     */
    function forceRecoverCollateralOnBehalfOf(
        address /* who */,
        bytes32 positionId,
        address recipient
    )
        external
        /* view */
        onlyMargin
        returns (bool)
    {
        return ownerOf(uint256(positionId)) == recipient;
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
        assert(owner != address(0)); // ownerOf() should have already required this

        address owedToken = owedTokenAddress[positionId];
        uint256 totalRepaid = Margin(DYDX_MARGIN).getTotalOwedTokenRepaidToLender(positionId);
        uint256 tokensToSend = totalRepaid.sub(owedTokensRepaidSinceLastWithdraw[positionId]);

        if (tokensToSend == 0) {
            return 0;
        }

        // update state based on whether the position is closed or not
        bool completelyRepaid = false;
        if (Margin(DYDX_MARGIN).isPositionClosed(positionId)) {
            burnPositionToken(owner, positionId);
            completelyRepaid = true;
        } else {
            owedTokensRepaidSinceLastWithdraw[positionId] = totalRepaid;
        }

        assert(TokenInteract.balanceOf(owedToken, address(this)) >= tokensToSend);
        TokenInteract.transfer(owedToken, owner, tokensToSend);

        emit OwedTokenWithdrawn(
            positionId,
            owner,
            owedToken,
            tokensToSend,
            completelyRepaid
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
