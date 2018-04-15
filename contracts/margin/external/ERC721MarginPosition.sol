pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { ReentrancyGuard } from "zeppelin-solidity/contracts/ReentrancyGuard.sol";
import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { ERC721Token } from "zeppelin-solidity/contracts/token/ERC721/ERC721Token.sol";
import { Margin } from "../Margin.sol";
import { ClosePositionDelegator } from "../interfaces/ClosePositionDelegator.sol";
import { PositionCustodian } from "./interfaces/PositionCustodian.sol";


/**
 * @title ERC721MarginPosition
 * @author dYdX
 *
 * Contract used to tokenize positions as ERC721-compliant non-fungible tokens. Holding the
 * token allows the holder to close the position. Functionality is added to let users approve
 * other addresses to close their positions for them.
 */
 /* solium-disable-next-line */
contract ERC721MarginPosition is
    ERC721Token,
    ClosePositionDelegator,
    PositionCustodian,
    ReentrancyGuard
{
    using SafeMath for uint256;

    // ============ Events ============

    event CloserApproval(
        address indexed owner,
        address indexed approved,
        bool isApproved
    );

    event RecipientApproval(
        address indexed owner,
        address indexed approved,
        bool isApproved
    );

    // ============ State Variables ============

    // Mapping from an address to other addresses that are approved to be positions closers
    mapping (address => mapping (address => bool)) public approvedClosers;

    // Mapping from an address to other addresses that are approved to be payoutRecipients
    mapping (address => mapping (address => bool)) public approvedRecipients;

    // ============ Constructor ============

    function ERC721MarginPosition(
        address margin
    )
        public
        ERC721Token("dYdX Margin Positions", "DYDX-M")
        ClosePositionDelegator(margin)
    {
    }

    // ============ Token-Holder functions ============

    /**
     * Approve any close with the specified closer as the msg.sender of the close.
     *
     * @param  closer      Address of the closer
     * @param  isApproved  True if approving the closer, false if revoking approval
     */
    function approveCloser(
        address closer,
        bool isApproved
    )
        external
        nonReentrant
    {
        // cannot approve self since any address can already close its own positions
        require(closer != msg.sender);

        if (approvedClosers[msg.sender][closer] != isApproved) {
            approvedClosers[msg.sender][closer] = isApproved;
            emit CloserApproval(msg.sender, closer, isApproved);
        }
    }

    /**
     * Approve any close with the specified recipient as the payoutRecipient of the close.
     *
     * NOTE: An account approving itself as a recipient is often a very bad idea. A smart contract
     * that approves itself should implement the PayoutRecipient interface for dYdX to verify that
     * it is given a fair payout for an external account closing the position.
     *
     * @param  recipient   Address of the recipient
     * @param  isApproved  True if approving the recipient, false if revoking approval
     */
    function approveRecipient(
        address recipient,
        bool isApproved
    )
        external
        nonReentrant
    {
        if (approvedRecipients[msg.sender][recipient] != isApproved) {
            approvedRecipients[msg.sender][recipient] = isApproved;
            emit RecipientApproval(msg.sender, recipient, isApproved);
        }
    }

    /**
     * Transfer ownership of the position externally to this contract, thereby burning the token
     *
     * @param  positionId  Unique ID of the position
     * @param  to          Address to transfer postion ownership to
     */
    function transferPosition(
        bytes32 positionId,
        address to
    )
        external
        nonReentrant
    {
        uint256 tokenId = uint256(positionId);
        require(msg.sender == ownerOf(tokenId));
        _burn(msg.sender, tokenId); // requires msg.sender to be owner
        Margin(MARGIN).transferPosition(positionId, to);
    }

    /**
     * Burn an invalid token. Callable by anyone. Used to burn unecessary tokens for clarity and to
     * free up storage. Throws if the position is not yet closed.
     *
     * @param  positionId  Unique ID of the position
     */
    function burnTokenSafe(
        bytes32 positionId
    )
        external
        nonReentrant
    {
        require(!Margin(MARGIN).containsPosition(positionId));
        _burn(ownerOf(uint256(positionId)), uint256(positionId));
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
    function receivePositionOwnership(
        address from,
        bytes32 positionId
    )
        external
        onlyMargin
        nonReentrant
        returns (address)
    {
        _mint(from, uint256(positionId));
        return address(this); // returning own address retains ownership of position
    }

    /**
     * Called by Margin when additional value is added onto the position this contract
     * owns. Only allows token owner to add value.
     *
     * @param  from            Address that added the value to the position
     * @param  positionId      Unique ID of the position
     *  param  principalAdded  (unused)
     * @return                 True if the adder is the token owner, false otherwise
     */
    function marginPositionIncreased(
        address from,
        bytes32 positionId,
        uint256 /* principalAdded */
    )
        external
        onlyMargin
        nonReentrant
        returns (bool)
    {
        if (ownerOf(uint256(positionId)) == from) {
            return true;
        }

        return false;
    }

    /**
     * Called by Margin when an owner of this token is attempting to close some of the
     * position. Implementation is required per PositionOwner contract in order to be used by
     * Margin to approve closing parts of a position. If true is returned, this contract
     * must assume that Margin will either revert the entire transaction or that the specified
     * amount of the position was successfully closed.
     *
     * @param  closer           Address of the caller of the close function
     * @param  payoutRecipient  Address of the recipient of any quote tokens paid out
     * @param  positionId       Unique ID of the position
     * @param  requestedAmount  Amount of the position being closed
     * @return                  The amount the user is allowed to close for the specified position
     */
    function closeOnBehalfOf(
        address closer,
        address payoutRecipient,
        bytes32 positionId,
        uint256 requestedAmount
    )
        external
        onlyMargin
        nonReentrant
        returns (uint256)
    {
        // Cannot burn the token since the position hasn't been closed yet and getPositionDeedHolder
        // must return the owner of the position after it has been closed in the current transaction

        address owner = ownerOf(uint256(positionId));
        if (
            (closer == owner)
            || approvedClosers[owner][closer]
            || approvedRecipients[owner][payoutRecipient]
        ) {
            return requestedAmount;
        }

        return 0;
    }

    // ============ PositionCustodian Functions ============

    function getPositionDeedHolder(
        bytes32 positionId
    )
        external
        view
        returns (address)
    {
        return ownerOf(uint256(positionId));
    }
}
