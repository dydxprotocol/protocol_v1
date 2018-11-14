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

import { Math } from "openzeppelin-solidity/contracts/math/Math.sol";
import { SafeMath } from "openzeppelin-solidity/contracts/math/SafeMath.sol";
import { StandardToken } from "openzeppelin-solidity/contracts/token/ERC20/StandardToken.sol";
import { Margin } from "../../Margin.sol";
import { MathHelpers } from "../../../lib/MathHelpers.sol";
import { ReentrancyGuard } from "../../../lib/ReentrancyGuard.sol";
import { TokenInteract } from "../../../lib/TokenInteract.sol";
import { MarginCommon } from "../../impl/MarginCommon.sol";
import { OnlyMargin } from "../../interfaces/OnlyMargin.sol";
import { ClosePositionDelegator } from "../../interfaces/owner/ClosePositionDelegator.sol";
import { IncreasePositionDelegator } from "../../interfaces/owner/IncreasePositionDelegator.sol";
import { PositionOwner } from "../../interfaces/owner/PositionOwner.sol";
import { PositionCustodian } from "../interfaces/PositionCustodian.sol";
import { MarginHelper } from "../lib/MarginHelper.sol";


/**
 * @title ERC20Position
 * @author dYdX
 *
 * Shared code for ERC20Short and ERC20Long
 */
contract ERC20Position is
    ReentrancyGuard,
    StandardToken,
    OnlyMargin,
    PositionOwner,
    IncreasePositionDelegator,
    ClosePositionDelegator,
    PositionCustodian
{
    using SafeMath for uint256;

    // ============ Enums ============

    enum State {
        UNINITIALIZED,
        OPEN,
        CLOSED
    }

    // ============ Events ============

    /**
     * This ERC20 was successfully initialized
     */
    event Initialized(
        bytes32 positionId,
        uint256 initialSupply
    );

    /**
     * The position was completely closed by a trusted third-party and tokens can be withdrawn
     */
    event ClosedByTrustedParty(
        address closer,
        uint256 tokenAmount,
        address payoutRecipient
    );

    /**
     * The position was completely closed and tokens can be withdrawn
     */
    event CompletelyClosed();

    /**
     * A user burned tokens to withdraw heldTokens from this contract after the position was closed
     */
    event Withdraw(
        address indexed redeemer,
        uint256 tokensRedeemed,
        uint256 heldTokenPayout
    );

    /**
     * A user burned tokens in order to partially close the position
     */
    event Close(
        address indexed redeemer,
        uint256 closeAmount
    );

    // ============ State Variables ============

    // All tokens will initially be allocated to this address
    address public INITIAL_TOKEN_HOLDER;

    // Unique ID of the position this contract is tokenizing
    bytes32 public POSITION_ID;

    // Recipients that will fairly verify and redistribute funds from closing the position
    mapping (address => bool) public TRUSTED_RECIPIENTS;

    // Withdrawers that will fairly withdraw funds after the position has been closed
    mapping (address => bool) public TRUSTED_WITHDRAWERS;

    // Current State of this contract. See State enum
    State public state;

    // Address of the position's heldToken. Cached for convenience and lower-cost withdrawals
    address public heldToken;

    // Position has been closed using a trusted recipient
    bool public closedUsingTrustedRecipient;

    // ============ Modifiers ============

    modifier onlyPosition(bytes32 positionId) {
        require(
            POSITION_ID == positionId,
            "ERC20Position#onlyPosition: Incorrect position"
        );
        _;
    }

    modifier onlyState(State specificState) {
        require(
            state == specificState,
            "ERC20Position#onlyState: Incorrect State"
        );
        _;
    }

    // ============ Constructor ============

    constructor(
        bytes32 positionId,
        address margin,
        address initialTokenHolder,
        address[] trustedRecipients,
        address[] trustedWithdrawers
    )
        public
        OnlyMargin(margin)
    {
        POSITION_ID = positionId;
        state = State.UNINITIALIZED;
        INITIAL_TOKEN_HOLDER = initialTokenHolder;
        closedUsingTrustedRecipient = false;

        uint256 i;
        for (i = 0; i < trustedRecipients.length; i++) {
            TRUSTED_RECIPIENTS[trustedRecipients[i]] = true;
        }
        for (i = 0; i < trustedWithdrawers.length; i++) {
            TRUSTED_WITHDRAWERS[trustedWithdrawers[i]] = true;
        }
    }

    // ============ Margin-Only Functions ============

    /**
     * Called by Margin when anyone transfers ownership of a position to this contract.
     * This function initializes the tokenization of the position given and returns this address to
     * indicate to Margin that it is willing to take ownership of the position.
     *
     *  param  (unused)
     * @param  positionId  Unique ID of the position
     * @return             This address on success, throw otherwise
     */
    function receivePositionOwnership(
        address /* from */,
        bytes32 positionId
    )
        external
        onlyMargin
        nonReentrant
        onlyState(State.UNINITIALIZED)
        onlyPosition(positionId)
        returns (address)
    {
        MarginCommon.Position memory position = MarginHelper.getPosition(DYDX_MARGIN, POSITION_ID);
        assert(position.principal > 0);

        // set relevant constants
        state = State.OPEN;
        heldToken = position.heldToken;

        uint256 tokenAmount = getTokenAmountOnAdd(position.principal);

        emit Initialized(POSITION_ID, tokenAmount);

        mint(INITIAL_TOKEN_HOLDER, tokenAmount);

        return address(this); // returning own address retains ownership of position
    }

    /**
     * Called by Margin when additional value is added onto the position this contract
     * owns. Tokens are minted and assigned to the address that added the value.
     *
     * @param  trader          Address that added the value to the position
     * @param  positionId      Unique ID of the position
     * @param  principalAdded  Amount that was added to the position
     * @return                 This address on success, throw otherwise
     */
    function increasePositionOnBehalfOf(
        address trader,
        bytes32 positionId,
        uint256 principalAdded
    )
        external
        onlyMargin
        nonReentrant
        onlyState(State.OPEN)
        onlyPosition(positionId)
        returns (address)
    {
        require(
            !Margin(DYDX_MARGIN).isPositionCalled(POSITION_ID),
            "ERC20Position#increasePositionOnBehalfOf: Position is margin-called"
        );
        require(
            !closedUsingTrustedRecipient,
            "ERC20Position#increasePositionOnBehalfOf: Position closed using trusted recipient"
        );

        uint256 tokenAmount = getTokenAmountOnAdd(principalAdded);

        mint(trader, tokenAmount);

        return address(this);
    }

    /**
     * Called by Margin when an owner of this token is attempting to close some of the
     * position. Implementation is required per PositionOwner contract in order to be used by
     * Margin to approve closing parts of a position.
     *
     * @param  closer           Address of the caller of the close function
     * @param  payoutRecipient  Address of the recipient of tokens paid out from closing
     * @param  positionId       Unique ID of the position
     * @param  requestedAmount  Amount (in principal) of the position being closed
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
        onlyState(State.OPEN)
        onlyPosition(positionId)
        returns (address, uint256)
    {
        uint256 positionPrincipal = Margin(DYDX_MARGIN).getPositionPrincipal(positionId);

        assert(requestedAmount <= positionPrincipal);

        uint256 allowedAmount;
        if (TRUSTED_RECIPIENTS[payoutRecipient]) {
            allowedAmount = closeUsingTrustedRecipient(
                closer,
                payoutRecipient,
                requestedAmount
            );
        } else {
            allowedAmount = close(
                closer,
                requestedAmount,
                positionPrincipal
            );
        }

        assert(allowedAmount > 0);
        assert(allowedAmount <= requestedAmount);

        if (allowedAmount == positionPrincipal) {
            state = State.CLOSED;
            emit CompletelyClosed();
        }

        return (address(this), allowedAmount);
    }

    // ============ Public State Changing Functions ============

    /**
     * Withdraw heldTokens from this contract for any of the position that was closed via external
     * means (such as an auction-closing mechanism)
     *
     * NOTE: It is possible that this contract could be sent heldToken by external sources
     * other than from the Margin contract. In this case the payout for token holders
     * would be greater than just that from the normal payout. This is fine because
     * nobody has incentive to send this contract extra funds, and if they do then it's
     * also fine just to let the token holders have it.
     *
     * NOTE: If there are significant rounding errors, then it is possible that withdrawing later is
     * more advantageous. An "attack" could involve withdrawing for others before withdrawing for
     * yourself. Likely, rounding error will be small enough to not properly incentivize people to
     * carry out such an attack.
     *
     * @param  onBehalfOf  Address of the account to withdraw for
     * @return             The amount of heldToken withdrawn
     */
    function withdraw(
        address onBehalfOf
    )
        external
        nonReentrant
        returns (uint256)
    {
        setStateClosedIfClosed();
        require(
            state == State.CLOSED,
            "ERC20Position#withdraw: Position has not yet been closed"
        );

        if (msg.sender != onBehalfOf) {
            require(
                TRUSTED_WITHDRAWERS[msg.sender],
                "ERC20Position#withdraw: Only trusted withdrawers can withdraw on behalf of others"
            );
        }

        return withdrawImpl(msg.sender, onBehalfOf);
    }

    // ============ Public Constant Functions ============

    /**
     * ERC20 name function
     *
     * @return  The name of the Margin Token
     */
    function name()
        external
        view
        returns (string);

    /**
     * ERC20 symbol function
     *
     * @return  The symbol of the Margin Token
     */
    function symbol()
        external
        view
        returns (string);

    /**
     * ERC20 decimals function
     *
     * @return  The number of decimal places
     */
    function decimals()
        external
        view
        returns (uint8);

    /**
     * Implements PositionCustodian functionality. Called by external contracts to see where to pay
     * tokens as a result of closing a position on behalf of this contract
     *
     * @param  positionId  Unique ID of the position
     * @return             Address of this contract. Indicates funds should be sent to this contract
     */
    function getPositionDeedHolder(
        bytes32 positionId
    )
        external
        view
        onlyPosition(positionId)
        returns (address)
    {
        // Claim ownership of deed and allow token holders to withdraw funds from this contract
        return address(this);
    }

    // ============ Internal Helper-Functions ============

    /**
     * Tokens are not burned when a trusted recipient is used, but we require the position to be
     * completely closed. All token holders are then entitled to the heldTokens in the contract
     */
    function closeUsingTrustedRecipient(
        address closer,
        address payoutRecipient,
        uint256 requestedAmount
    )
        internal
        returns (uint256)
    {
        assert(requestedAmount > 0);

        // remember that a trusted recipient was used
        if (!closedUsingTrustedRecipient) {
            closedUsingTrustedRecipient = true;
        }

        emit ClosedByTrustedParty(closer, requestedAmount, payoutRecipient);

        return requestedAmount;
    }

    // ============ Private Helper-Functions ============

    function withdrawImpl(
        address receiver,
        address onBehalfOf
    )
        private
        returns (uint256)
    {
        uint256 value = balanceOf(onBehalfOf);

        if (value == 0) {
            return 0;
        }

        uint256 heldTokenBalance = TokenInteract.balanceOf(heldToken, address(this));

        // NOTE the payout must be calculated before decrementing the totalSupply below
        uint256 heldTokenPayout = MathHelpers.getPartialAmount(
            value,
            totalSupply_,
            heldTokenBalance
        );

        // Destroy the margin tokens
        burn(onBehalfOf, value);
        emit Withdraw(onBehalfOf, value, heldTokenPayout);

        // Send the redeemer their proportion of heldToken
        TokenInteract.transfer(heldToken, receiver, heldTokenPayout);

        return heldTokenPayout;
    }

    function setStateClosedIfClosed(
    )
        private
    {
        // If in OPEN state, but the position is closed, set to CLOSED state
        if (state == State.OPEN && Margin(DYDX_MARGIN).isPositionClosed(POSITION_ID)) {
            state = State.CLOSED;
            emit CompletelyClosed();
        }
    }

    function close(
        address closer,
        uint256 requestedAmount,
        uint256 positionPrincipal
    )
        private
        returns (uint256)
    {
        uint256 balance = balances[closer];

        (
            uint256 tokenAmount,
            uint256 allowedCloseAmount
        ) = getCloseAmounts(
            requestedAmount,
            balance,
            positionPrincipal
        );

        require(
            tokenAmount > 0 && allowedCloseAmount > 0,
            "ERC20Position#close: Cannot close 0 amount"
        );

        assert(allowedCloseAmount <= requestedAmount);

        burn(closer, tokenAmount);

        emit Close(closer, tokenAmount);

        return allowedCloseAmount;
    }

    function burn(
        address from,
        uint256 amount
    )
        private
    {
        assert(from != address(0));
        totalSupply_ = totalSupply_.sub(amount);
        balances[from] = balances[from].sub(amount);
        emit Transfer(from, address(0), amount);
    }

    function mint(
        address to,
        uint256 amount
    )
        private
    {
        assert(to != address(0));
        totalSupply_ = totalSupply_.add(amount);
        balances[to] = balances[to].add(amount);
        emit Transfer(address(0), to, amount);
    }

    // ============ Private Abstract Functions ============

    function getTokenAmountOnAdd(
        uint256 principalAdded
    )
        internal
        view
        returns (uint256);

    function getCloseAmounts(
        uint256 requestedCloseAmount,
        uint256 balance,
        uint256 positionPrincipal
    )
        private
        view
        returns (
            uint256 /* tokenAmount */,
            uint256 /* allowedCloseAmount */
        );
}
