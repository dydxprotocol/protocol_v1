pragma solidity 0.4.19;

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { ReentrancyGuard } from "zeppelin-solidity/contracts/ReentrancyGuard.sol";
import { ERC721Token } from "zeppelin-solidity/contracts/token/ERC721/ERC721Token.sol";
import { CloseShortDelegator } from "../interfaces/CloseShortDelegator.sol";
import { ShortCustodian } from "./interfaces/ShortCustodian.sol";
import { ShortSellGetters } from "../impl/ShortSellGetters.sol";
import { ShortSell } from "../ShortSell.sol";


/**
 * @title ERC721Short
 * @author dYdX
 */
 /* solium-disable-next-line */
contract ERC721Short is
    ERC721Token,
    CloseShortDelegator,
    ShortCustodian,
    ReentrancyGuard {
    using SafeMath for uint256;

    // --------------------
    // ------ Events ------
    // --------------------

    event CloserApproval(
        address indexed _owner,
        address indexed _approved,
        bool _isApproved
    );

    event RecipientApproval(
        address indexed _owner,
        address indexed _approved,
        bool _isApproved
    );

    // -----------------------------
    // ------ State Variables ------
    // -----------------------------

    // Mapping from an address to other addresses that are approved to be short closers
    mapping (address => mapping (address => bool)) public approvedClosers;

    // Mapping from an address to other addresses that are approved to be payoutRecipients
    mapping (address => mapping (address => bool)) public approvedRecipients;

    // -------------------------
    // ------ Constructor ------
    // -------------------------

    function ERC721Short(
        address _shortSell
    )
        public
        CloseShortDelegator(_shortSell)
    {
    }

    // --------------------------------
    // ---- Token-Holder functions ----
    // --------------------------------

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
        nonReentrant
        external
    {
        // cannot approve self since any address can already close its own short positions
        require(closer != msg.sender);

        if (approvedClosers[msg.sender][closer] != isApproved) {
            approvedClosers[msg.sender][closer] = isApproved;
            CloserApproval(msg.sender, closer, isApproved);
        }
    }

    /**
     * Approve any close with the specified recipient as the payoutRecipient of the close.
     *
     * NOTE: An account approving itself as a recipient is often a very bad idea. A smart contract
     * that approves itself should implement the PayoutRecipient interface for dYdX to verify that
     * it is given a fair payout for an external account closing the short.
     *
     * @param  recipient   Address of the recipient
     * @param  isApproved  True if approving the recipient, false if revoking approval
     */
    function approveRecipient(
        address recipient,
        bool isApproved
    )
        nonReentrant
        external
    {
        if (approvedRecipients[msg.sender][recipient] != isApproved) {
            approvedRecipients[msg.sender][recipient] = isApproved;
            RecipientApproval(msg.sender, recipient, isApproved);
        }
    }

    /**
     * Transfer ownership of the short externally to this contract, thereby burning the token
     *
     * @param  shortId  Unique ID of the short
     * @param  to       Address to transfer short ownership to
     */
    function transferShort(
        bytes32 shortId,
        address to
    )
        nonReentrant
        external
    {
        uint256 tokenId = uint256(shortId);
        require(msg.sender == ownerOf(tokenId));
        _burn(tokenId); // requires msg.sender to be owner
        ShortSell(SHORT_SELL).transferShort(shortId, to);
    }

    function burnTokenSafe(
        bytes32 shortId
    )
        nonReentrant
        external
    {
        require(!ShortSell(SHORT_SELL).containsShort(shortId));
        _burn(uint256(shortId));
    }

    // ---------------------------------
    // ---- OnlyShortSell Functions ----
    // ---------------------------------

    /**
     * Called by the ShortSell contract when anyone transfers ownership of a short to this contract.
     * This function mints a new ERC721 Token and returns this address to
     * indicate to ShortSell that it is willing to take ownership of the short.
     *
     * @param  from     Address of previous short owner
     * @param  shortId  Unique ID of the short
     * @return this address on success, throw otherwise
     */
    function receiveShortOwnership(
        address from,
        bytes32 shortId
    )
        onlyShortSell
        nonReentrant
        external
        returns (address owner)
    {
        _mint(from, uint256(shortId));
        return address(this); // returning own address retains ownership of short
    }

    /**
     * Called by ShortSell when an owner of this token is attempting to close some of the short
     * position. Implementation is required per ShortOwner contract in order to be used by
     * ShortSell to approve closing parts of a short position. If true is returned, this contract
     * must assume that ShortSell will either revert the entire transaction or that the specified
     * amount of the short position was successfully closed.
     *
     * @param closer           Address of the caller of the close function
     * @param payoutRecipient  Address of the recipient of any base tokens paid out
     * @param shortId          Id of the short being closed
     * @param requestedAmount  Amount of the short being closed
     * @return allowedAmount   The amount the user is allowed to close for the specified short
     */
    function closeOnBehalfOf(
        address closer,
        address payoutRecipient,
        bytes32 shortId,
        uint256 requestedAmount
    )
        onlyShortSell
        nonReentrant
        external
        returns (uint256 allowedAmount)
    {
        // Cannot burn the token since the short hasn't been closed yet and getShortSellDeedHolder
        // must return the owner of the short after it has been closed in the current transaction.

        address owner = ownerOf(uint256(shortId));
        allowedAmount = 0;
        if (
            (closer == owner)
            || approvedClosers[owner][closer]
            || approvedRecipients[owner][payoutRecipient]
        ) {
            allowedAmount = requestedAmount;
        }
    }

    // ----------------------------------
    // ---- ShortCustodian Functions ----
    // ----------------------------------

    function getShortSellDeedHolder(
        bytes32 shortId
    )
        external
        view
        returns (address deedHolder)
    {
        deedHolder = ownerOf(uint256(shortId));
    }
}
