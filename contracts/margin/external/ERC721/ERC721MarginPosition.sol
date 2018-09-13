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

pragma solidity 0.4.24;
pragma experimental "v0.5.0";

import { SafeMath } from "openzeppelin-solidity/contracts/math/SafeMath.sol";
import { ERC721Token } from "openzeppelin-solidity/contracts/token/ERC721/ERC721Token.sol";
import { Margin } from "../../Margin.sol";
import { ReentrancyGuard } from "../../../lib/ReentrancyGuard.sol";
import { OnlyMargin } from "../../interfaces/OnlyMargin.sol";
import { ClosePositionDelegator } from "../../interfaces/owner/ClosePositionDelegator.sol";
import { DepositCollateralDelegator } from "../../interfaces/owner/DepositCollateralDelegator.sol";
import { IncreasePositionDelegator } from "../../interfaces/owner/IncreasePositionDelegator.sol";
import { PositionOwner } from "../../interfaces/owner/PositionOwner.sol";
import { PositionCustodian } from "../interfaces/PositionCustodian.sol";


/**
 * @title ERC721MarginPosition
 * @author dYdX
 *
 * Contract used to tokenize positions as ERC721-compliant non-fungible tokens. Holding the
 * token allows the holder to close the position. Functionality is added to let users approve
 * other addresses to close their positions for them.
 */
contract ERC721MarginPosition is
    ReentrancyGuard,
    ERC721Token,
    OnlyMargin,
    PositionOwner,
    IncreasePositionDelegator,
    ClosePositionDelegator,
    DepositCollateralDelegator,
    PositionCustodian
{
    using SafeMath for uint256;

    // ============ Events ============

    /**
     * A token was created by transferring direct position ownership to this contract.
     */
    event PositionTokenized(
        bytes32 indexed positionId,
        address indexed owner
    );

    /**
     * A token was burned from transferring direct position ownership to an address other than
     * this contract.
     */
    event PositionUntokenized(
        bytes32 indexed positionId,
        address indexed owner,
        address ownershipSentTo
    );

    /**
     * Closer approval was granted or revoked.
     */
    event CloserApproval(
        address indexed owner,
        address indexed approved,
        bool isApproved
    );

    /**
     * Recipient approval was granted or revoked.
     */
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

    constructor(
        address margin
    )
        public
        ERC721Token("dYdX ERC721 Margin Positions", "d/PO")
        OnlyMargin(margin)
    {}

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
        require(
            closer != msg.sender,
            "ERC721MarginPosition#approveCloser: Cannot approve self"
        );

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
    function untokenizePosition(
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
            "ERC721MarginPosition#untokenizePosition: Only token owner can call"
        );

        _burn(owner, tokenId);
        Margin(DYDX_MARGIN).transferPosition(positionId, to);

        emit PositionUntokenized(positionId, owner, to);
    }

    /**
     * Burn an invalid token. Callable by anyone. Used to burn unecessary tokens for clarity and to
     * free up storage. Throws if the position is not yet closed.
     *
     * @param  positionId  Unique ID of the position
     */
    function burnClosedToken(
        bytes32 positionId
    )
        external
        nonReentrant
    {
        burnClosedTokenInternal(positionId);
    }

    /**
     * Burn several invalid tokens. Callable by anyone. Used to burn unecessary tokens for clarity
     * and to free up storage. Throws if the position is not yet closed.
     *
     * @param  positionIds  Unique IDs of the positions
     */
    function burnClosedTokenMultiple(
        bytes32[] positionIds
    )
        external
        nonReentrant
    {
        for (uint256 i = 0; i < positionIds.length; i++) {
            burnClosedTokenInternal(positionIds[i]);
        }
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
        emit PositionTokenized(positionId, from);
        return address(this); // returning own address retains ownership of position
    }

    /**
     * Called by Margin when additional value is added onto the position this contract
     * owns. Defer approval to the token holder
     *
     *  param  trader          (unused)
     * @param  positionId      Unique ID of the position
     *  param  principalAdded  (unused)
     * @return                 This address to accept, a different address to ask that contract
     */
    function increasePositionOnBehalfOf(
        address /* trader */,
        bytes32 positionId,
        uint256 /* principalAdded */
    )
        external
        onlyMargin
        nonReentrant
        returns (address)
    {
        return ownerOfPosition(positionId);
    }

    /**
     * Called by Margin when an owner of this token is attempting to close some of the
     * position. Implementation is required per PositionOwner contract in order to be used by
     * Margin to approve closing parts of a position.
     *
     * @param  closer           Address of the caller of the close function
     * @param  payoutRecipient  Address of the recipient of tokens paid out from closing
     * @param  positionId       Unique ID of the position
     * @param  requestedAmount  Amount of the position being closed
     * @return                  1) This address to accept, a different address to ask that contract
     *                          2) The maximum amount that this contract is allowing
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
        returns (address, uint256)
    {
        // Cannot burn the token since the position hasn't been closed yet and getPositionDeedHolder
        // must return the owner of the position after it has been closed in the current transaction

        address owner = ownerOfPosition(positionId);

        if (approvedClosers[owner][closer] || approvedRecipients[owner][payoutRecipient]) {
            return (address(this), requestedAmount);
        }

        return (owner, requestedAmount);
    }

    /**
     * Function a contract must implement in order to let other addresses call depositCollateral().
     *
     *  param  depositor   (unused)
     * @param  positionId  Unique ID of the position
     *  param  amount      (unused)
     * @return             This address to accept, a different address to ask that contract
     */
    function depositCollateralOnBehalfOf(
        address /* depositor */,
        bytes32 positionId,
        uint256 /* amount */
    )
        external
        onlyMargin
        nonReentrant
        returns (address)
    {
        return ownerOfPosition(positionId);
    }

    // ============ PositionCustodian Functions ============

    function getPositionDeedHolder(
        bytes32 positionId
    )
        external
        view
        returns (address)
    {
        return ownerOfPosition(positionId);
    }

    // ============ Private Helper-Functions ============

    function burnClosedTokenInternal(
        bytes32 positionId
    )
        private
    {
        require(
            Margin(DYDX_MARGIN).isPositionClosed(positionId),
            "ERC721MarginPosition#burnClosedTokenInternal: Position is not closed"
        );
        _burn(ownerOfPosition(positionId), uint256(positionId));
    }

    function ownerOfPosition(
        bytes32 positionId
    )
        private
        view
        returns (address)
    {
        address owner = ownerOf(uint256(positionId));

        // ownerOf() should have already required this
        assert(owner != address(0));

        require(
            owner != address(this),
            "ERC721MarginPosition#ownerOfPosition: 721 contract should not own tokens"
        );

        return owner;
    }
}
