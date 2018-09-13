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
import { Margin } from "../Margin.sol";
import { MathHelpers } from "../../lib/MathHelpers.sol";
import { ReentrancyGuard } from "../../lib/ReentrancyGuard.sol";
import { TokenInteract } from "../../lib/TokenInteract.sol";
import { MarginCommon } from "../impl/MarginCommon.sol";
import { OnlyMargin } from "../interfaces/OnlyMargin.sol";
/* solium-disable-next-line max-len*/
import { ForceRecoverCollateralDelegator } from "../interfaces/lender/ForceRecoverCollateralDelegator.sol";
import { IncreaseLoanDelegator } from "../interfaces/lender/IncreaseLoanDelegator.sol";
import { LoanOwner } from "../interfaces/lender/LoanOwner.sol";
import { MarginCallDelegator } from "../interfaces/lender/MarginCallDelegator.sol";
import { MarginHelper } from "./lib/MarginHelper.sol";


/**
 * @title SharedLoan
 * @author dYdX
 *
 * This contract is used to share loan positions. Multiple participants can share in a loan
 * position, and will all be paid out proportional to ownership when the loan is repaid. Ownership
 * is non-transferrable
 */
contract SharedLoan is
    ReentrancyGuard,
    OnlyMargin,
    LoanOwner,
    IncreaseLoanDelegator,
    MarginCallDelegator,
    ForceRecoverCollateralDelegator
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
     * This SharedLoan was successfully initialized
     */
    event Initialized(
        bytes32 positionId,
        uint256 initialAmount
    );

    /**
     * Balance was added to the loan position
     */
    event BalanceAdded(
        address indexed who,
        uint256 amount
    );

    /**
     * Funds were withdrawn by a lender after the loan was partially or completely repaid
     */
    event TokensWithdrawn(
        address indexed who,
        uint256 owedTokenAmount,
        uint256 heldTokenAmount,
        bool completelyRepaid
    );

    // ============ State Variables ============

    // Initial lender of the position
    address public INITIAL_LENDER;

    // Unique ID of the position this contract is lending for
    bytes32 public POSITION_ID;

    // Addresses that can margin-call the position
    mapping (address => bool) public TRUSTED_MARGIN_CALLERS;

    // Current State of this contract. See State enum
    State public state;

    // Address of the position's owedToken. Cached for convenience and lower-cost withdrawals
    address public owedToken;

    // Address of the position's heldToken. Cached for convenience and lower-cost withdrawals
    address public heldToken;

    // Total principal
    uint256 public totalPrincipal;

    // Amount that has been fully repaid and withdrawn
    uint256 public totalPrincipalFullyWithdrawn;

    // Total amount of owedToken that has been withdrawn
    uint256 public totalOwedTokenWithdrawn;

    // Principal attributed to each lender
    mapping (address => uint256) public balances;

    // Amount of owedToken each lender has withdrawn before the loan was fully repaid
    mapping (address => uint256) public owedTokenWithdrawnEarly;

    // ============ Modifiers ============

    modifier onlyPosition(bytes32 positionId) {
        require(
            POSITION_ID == positionId,
            "SharedLoan#onlyPosition: Incorrect position"
        );
        _;
    }

    modifier onlyState(State specificState) {
        require(
            state == specificState,
            "SharedLoan#onlyState: Incorrect State"
        );
        _;
    }

    // ============ Constructor ============

    constructor(
        bytes32 positionId,
        address margin,
        address initialLender,
        address[] trustedMarginCallers
    )
        public
        OnlyMargin(margin)
    {
        POSITION_ID = positionId;
        state = State.UNINITIALIZED;
        INITIAL_LENDER = initialLender;

        for (uint256 i = 0; i < trustedMarginCallers.length; i++) {
            TRUSTED_MARGIN_CALLERS[trustedMarginCallers[i]] = true;
        }
    }

    // ============ Margin-Only Functions ============

    /**
     * Called by the Margin contract when anyone transfers ownership of a loan to this contract.
     * This function initializes this contract and returns this address to indicate to Margin
     * that it is willing to take ownership of the loan.
     *
     *  param  from        (unused)
     * @param  positionId  Unique ID of the position
     * @return             This address on success, throw otherwise
     */
    function receiveLoanOwnership(
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
        totalPrincipal = position.principal;
        balances[INITIAL_LENDER] = position.principal;
        owedToken = position.owedToken;
        heldToken = position.heldToken;

        emit Initialized(POSITION_ID, position.principal);

        emit BalanceAdded(
            INITIAL_LENDER,
            position.principal
        );

        return address(this); // returning own address retains ownership of loan
    }

    /**
     * Called by Margin when additional value is added onto the position this contract
     * is lending for. Balance is added to the address that loaned the additional tokens.
     *
     * @param  payer           Address that loaned the additional tokens
     * @param  positionId      Unique ID of the position
     * @param  principalAdded  Amount that was added to the position
     *  param  lentAmount      (unused)
     * @return                 This address to accept, a different address to ask that contract
     */
    function increaseLoanOnBehalfOf(
        address payer,
        bytes32 positionId,
        uint256 principalAdded,
        uint256 /* lentAmount */
    )
        external
        onlyMargin
        nonReentrant
        onlyState(State.OPEN)
        onlyPosition(positionId)
        returns (address)
    {
        balances[payer] = balances[payer].add(principalAdded);
        totalPrincipal = totalPrincipal.add(principalAdded);

        emit BalanceAdded(
            payer,
            principalAdded
        );

        return address(this);
    }

    /**
     * Called by Margin when another address attempts to margin call the loan this contract owns
     *
     * @param  caller      Address attempting to initiate the loan call
     * @param  positionId  Unique ID of the position
     *  param  (unused)
     * @return             This address to accept, a different address to ask that contract
     */
    function marginCallOnBehalfOf(
        address caller,
        bytes32 positionId,
        uint256 /* depositAmount */
    )
        external
        onlyMargin
        nonReentrant
        onlyState(State.OPEN)
        onlyPosition(positionId)
        returns (address)
    {
        require(
            TRUSTED_MARGIN_CALLERS[caller],
            "SharedLoan#marginCallOnBehalfOf: margin caller must be trusted"
        );

        return address(this);
    }

    /**
     * Called by Margin when another address attempts to cancel a margin call for the loan
     * this contract owns
     *
     * @param  canceler    Address attempting to initiate the loan call cancel
     * @param  positionId  Unique ID of the position
     * @return             True to consent to the loan call being canceled if the initiator is a
     *                     trusted loan caller, false otherwise
     */
    function cancelMarginCallOnBehalfOf(
        address canceler,
        bytes32 positionId
    )
        external
        onlyMargin
        nonReentrant
        onlyState(State.OPEN)
        onlyPosition(positionId)
        returns (address)
    {
        require(
            TRUSTED_MARGIN_CALLERS[canceler],
            "SharedLoan#marginCallOnBehalfOf: margin call canceler must be trusted"
        );

        return address(this);
    }

    /**
     * Called by Margin when another address attempts to force recover the loan
     * this contract owns. This contract will receive funds on a force recover. This contract
     * always consents to anyone initiating a force recover
     *
     *  param  recoverer   (unused)
     * @param  positionId  Unique ID of the position
     * @param  recipient   Address to send the recovered tokens to
     * @return             This address to accept, a different address to ask that contract
     */
    function forceRecoverCollateralOnBehalfOf(
        address /* recoverer */,
        bytes32 positionId,
        address recipient
    )
        external
        onlyMargin
        nonReentrant
        onlyState(State.OPEN)
        onlyPosition(positionId)
        returns (address)
    {
        require(
            recipient == address(this),
            "SharedLoan#forceRecoverCollateralOnBehalfOf: Invalid collateral recipient"
        );

        state = State.CLOSED;

        return address(this);
    }

    // ============ Public State Changing Functions ============

    /**
     * Helper to allow withdrawal for multiple lenders in one call
     *
     * @param  who  Array of addresses to withdraw for
     */
    function withdrawMultiple(
        address[] who
    )
        external
        nonReentrant
    {
        require(
            state == State.OPEN || state == State.CLOSED,
            "SharedLoan#withdrawMultiple: Invalid state"
        );
        updateStateOnClosed();

        for (uint256 i = 0; i < who.length; i++) {
            withdrawImpl(who[i]);
        }
    }

    /**
     * Withdraw tokens that were repaid for this loan. Callable by anyone for a specific lender.
     * Tokens will be sent directly to the lender. Tokens could include owedToken and/or
     * heldToken (if the loan was force recovered). Callable at any time
     *
     * @param  who  Lender to withdraw for
     * @return      Values corresponding to:
     *              1) Amount of owedToken paid out
     *              2) Amount of heldToken paid out
     */
    function withdraw(
        address who
    )
        external
        nonReentrant
        returns (uint256, uint256)
    {
        require(
            state == State.OPEN || state == State.CLOSED,
            "SharedLoan#withdraw: Invalid state"
        );
        updateStateOnClosed();

        return withdrawImpl(who);
    }

    // ============ Private Functions ============

    function updateStateOnClosed()
        private
    {
        if (state != State.CLOSED) {
            if (Margin(DYDX_MARGIN).isPositionClosed(POSITION_ID)) {
                state = State.CLOSED;
            }
        }
    }

    function withdrawImpl(
        address who
    )
        private
        returns (uint256, uint256)
    {
        uint256 balance = balances[who];

        if (balance == 0) {
            return (0, 0);
        }

        uint256 owedTokenWithdrawn = withdrawOwedTokens(who, balance);
        uint256 heldTokenWithdrawn = 0;
        bool completelyRepaid = false;

        if (state == State.CLOSED) {
            heldTokenWithdrawn = withdrawHeldTokens(who, balance);
            totalPrincipalFullyWithdrawn = totalPrincipalFullyWithdrawn.add(balance);
            balances[who] = 0;
            completelyRepaid = true;
        }

        emit TokensWithdrawn(
            who,
            owedTokenWithdrawn,
            heldTokenWithdrawn,
            completelyRepaid
        );

        return (
            owedTokenWithdrawn,
            heldTokenWithdrawn
        );
    }

    function withdrawOwedTokens(
        address who,
        uint256 balance
    )
        private
        returns (uint256)
    {
        uint256 currentOwedTokenBalance = TokenInteract.balanceOf(
            owedToken,
            address(this));

        uint256 totalOwedTokenEverHeld = currentOwedTokenBalance.add(
            totalOwedTokenWithdrawn);

        uint256 allowedAmount = MathHelpers.getPartialAmount(
            balance,
            totalPrincipal,
            totalOwedTokenEverHeld
        ).sub(owedTokenWithdrawnEarly[who]);

        if (allowedAmount == 0) {
            return 0;
        }

        totalOwedTokenWithdrawn =
            totalOwedTokenWithdrawn.add(allowedAmount);
        if (state == State.OPEN) {
            owedTokenWithdrawnEarly[who] =
                owedTokenWithdrawnEarly[who].add(allowedAmount);
        }

        TokenInteract.transfer(owedToken, who, allowedAmount);

        return allowedAmount;
    }

    function withdrawHeldTokens(
        address who,
        uint256 balance
    )
        private
        returns (uint256)
    {
        uint256 currentHeldTokenBalance = TokenInteract.balanceOf(
            heldToken,
            address(this));

        uint256 allowedAmount = MathHelpers.getPartialAmount(
            balance,
            totalPrincipal.sub(totalPrincipalFullyWithdrawn),
            currentHeldTokenBalance
        );

        if (allowedAmount == 0) {
            return 0;
        }

        TokenInteract.transfer(heldToken, who, allowedAmount);

        return allowedAmount;
    }
}
