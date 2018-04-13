pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { ReentrancyGuard } from "zeppelin-solidity/contracts/ReentrancyGuard.sol";
import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { Margin } from "../Margin.sol";
import { MathHelpers } from "../../lib/MathHelpers.sol";
import { TokenInteract } from "../../lib/TokenInteract.sol";
import { MarginCommon } from "../impl/MarginCommon.sol";
import { ForceRecoverCollateralDelegator } from "../interfaces/ForceRecoverCollateralDelegator.sol";
import { MarginCallDelegator } from "../interfaces/MarginCallDelegator.sol";
import { MarginHelper } from "./lib/MarginHelper.sol";


/**
 * @title SharedLoan
 * @author dYdX
 *
 * This contract is used to share loan positions. Multiple participants can share in a loan
 * position, and will all be paid out proportional to ownership when the loan is repaid. Ownership
 * is non-transferrable
 */
/* solium-disable-next-line */
contract SharedLoan is
    MarginCallDelegator,
    ForceRecoverCollateralDelegator,
    ReentrancyGuard
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
        bytes32 marginId,
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
        uint256 baseTokenAmount,
        uint256 quoteTokenAmount,
        bool completelyRepaid
    );

    // ============ State Variables ============

    // Initial lender of the position
    address public INITIAL_LENDER;

    // Unique ID of the margin position this contract is lending for
    bytes32 public MARGIN_ID;

    // Addresses that can call in the loan
    mapping (address => bool) public TRUSTED_MARGIN_CALLERS;

    // Current State of this contract. See State enum
    State public state;

    // Address of the position's baseToken. Cached for convenience and lower-cost withdrawals
    address public baseToken;

    // Address of the position's quoteToken. Cached for convenience and lower-cost withdrawals
    address public quoteToken;

    // Total amount lent
    uint256 public totalAmount;

    // Amount that has been fully repaid and withdrawn
    uint256 public totalAmountFullyWithdrawn;

    // Total amount of base token that has been withdrawn
    uint256 public totalBaseTokenWithdrawn;

    // Amount lent by each lender
    mapping (address => uint256) public balances;

    // Amount of base token each lender has withdrawn before the loan was fully repaid
    mapping (address => uint256) public baseTokenWithdrawnEarly;

    // ============ Constructor ============

    function SharedLoan(
        bytes32 marginId,
        address margin,
        address initialLender,
        address[] trustedLoanCallers
    )
        public
        ForceRecoverCollateralDelegator(margin)
        MarginCallDelegator(margin)
    {
        MARGIN_ID = marginId;
        state = State.UNINITIALIZED;
        INITIAL_LENDER = initialLender;

        for (uint256 i = 0; i < trustedLoanCallers.length; i++) {
            TRUSTED_MARGIN_CALLERS[trustedLoanCallers[i]] = true;
        }
    }

    // ============ Margin-Only Functions ============

    /**
     * Called by the Margin contract when anyone transfers ownership of a loan to this contract.
     * This function initializes this contract and returns this address to indicate to Margin
     * that it is willing to take ownership of the loan.
     *
     *  param  (unused)
     * @param  marginId  Unique ID of the margin position
     * @return           This address on success, throw otherwise
     */
    function receiveLoanOwnership(
        address /* from */,
        bytes32 marginId
    )
        onlyMargin
        nonReentrant
        external
        returns (address)
    {
        // require uninitialized so that this cannot receive ownership from more than 1 loan
        require(state == State.UNINITIALIZED);
        require(MARGIN_ID == marginId);

        MarginCommon.Position memory position = MarginHelper.getPosition(MARGIN, MARGIN_ID);
        uint256 currentPositionAmount = position.amount.sub(position.closedAmount);
        assert(currentPositionAmount > 0);

        // set relevant constants
        state = State.OPEN;
        totalAmount = currentPositionAmount;
        balances[INITIAL_LENDER] = currentPositionAmount;
        baseToken = position.baseToken;
        quoteToken = position.quoteToken;

        emit Initialized(MARGIN_ID, currentPositionAmount);

        emit BalanceAdded(
            INITIAL_LENDER,
            currentPositionAmount
        );

        return address(this); // returning own address retains ownership of loan
    }

    /**
     * Called by Margin when additional value is added onto the margin position this contract
     * is lending for. Balance is added to the address that lent the additional tokens.
     *
     * @param  from         Address that lent the additional tokens
     * @param  marginId     Unique ID of the margin position
     * @param  amountAdded  Amount that was added to the position
     * @return              True to indicate that this contract consents to value being added
     */
    function loanIncreased(
        address from,
        bytes32 marginId,
        uint256 amountAdded
    )
        onlyMargin
        nonReentrant
        external
        returns (bool)
    {
        require(marginId == MARGIN_ID);

        balances[from] = balances[from].add(amountAdded);
        totalAmount = totalAmount.add(amountAdded);

        emit BalanceAdded(
            from,
            amountAdded
        );

        return true;
    }

    /**
     * Called by Margin when another address attempts to margin call the loan this contract owns
     *
     * @param  who       Address attempting to initiate the loan call
     * @param  marginId  Unique ID of the margin position
     *  param  (unused)
     * @return          True to consent to the loan being called if the initiator is a trusted
     *                  loan caller, false otherwise
     */
    function marginCallOnBehalfOf(
        address who,
        bytes32 marginId,
        uint256 /* depositAmount */
    )
        onlyMargin
        nonReentrant
        external
        returns (bool)
    {
        assert(state == State.OPEN);
        assert(MARGIN_ID == marginId);

        return TRUSTED_MARGIN_CALLERS[who];
    }

    /**
     * Called by Margin when another address attempts to cancel a margin call for the loan
     * this contract owns
     *
     * @param  who       Address attempting to initiate the loan call cancel
     * @param  marginId  Unique ID of the margin position
     * @return           True to consent to the loan call being canceled if the initiator is a
     *                   trusted loan caller, false otherwise
     */
    function cancelMarginCallOnBehalfOf(
        address who,
        bytes32 marginId
    )
        onlyMargin
        nonReentrant
        external
        returns (bool)
    {
        assert(state == State.OPEN);
        assert(MARGIN_ID == marginId);

        return TRUSTED_MARGIN_CALLERS[who];
    }

    /**
     * Called by Margin when another address attempts to force recover the loan
     * this contract owns. This contract will receive funds on a force recover. This contract
     * always consents to anyone initiating a force recover
     *
     *  param  (unused)
     * @param  marginId  Unique ID of the margin position
     * @return           True to consent to the loan being force recovered
     */
    function forceRecoverCollateralOnBehalfOf(
        address /* who */,
        bytes32 marginId
    )
        onlyMargin
        nonReentrant
        external
        returns (bool)
    {
        assert(state == State.OPEN);
        assert(MARGIN_ID == marginId);

        state = State.CLOSED;

        return true;
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
    {
        for (uint256 i = 0; i < who.length; i++) {
            withdraw(who[i]);
        }
    }

    /**
     * Withdraw tokens that were repaid for this loan. Callable by anyone for a specific lender.
     * Tokens will be sent directly to the lender. Tokens could include base token and/or
     * quote token (if the loan was force recovered). Callable at any time
     *
     * @param  who                  Lender to withdraw for
     * @return                      Values corresponding to:
     *  1) Amount of base token paid out
     *  2) Amount of quote token paid out
     */
    function withdraw(
        address who
    )
        nonReentrant
        public
        returns (uint256, uint256)
    {
        require(state == State.OPEN || state == State.CLOSED);

        updateStateOnClosed();

        if (balances[who] == 0) {
            return (0, 0);
        }

        uint256 baseTokenWithdrawn = withdrawBaseTokens(who);
        uint256 quoteTokenWithdrawn = withdrawQuoteTokens(who);
        bool completelyRepaid = false;

        if (state == State.CLOSED) {
            totalAmountFullyWithdrawn = totalAmountFullyWithdrawn.add(balances[who]);
            balances[who] = 0;
            completelyRepaid = true;
        }

        emit TokensWithdrawn(
            who,
            baseTokenWithdrawn,
            quoteTokenWithdrawn,
            completelyRepaid
        );

        return (
            baseTokenWithdrawn,
            quoteTokenWithdrawn
        );
    }

    // ============ Internal Functions ============

    function updateStateOnClosed()
        internal
    {
        if (state != State.CLOSED) {
            if (Margin(MARGIN).isPositionClosed(MARGIN_ID)) {
                state = State.CLOSED;
            }
        }
    }

    function withdrawBaseTokens(
        address who
    )
        internal
        returns (uint256)
    {
        uint256 currentBaseTokenBalance = TokenInteract.balanceOf(
            baseToken,
            address(this));

        uint256 totalBaseTokenEverHeld = currentBaseTokenBalance.add(
            totalBaseTokenWithdrawn);

        uint256 allowedAmount = MathHelpers.getPartialAmount(
            balances[who],
            totalAmount,
            totalBaseTokenEverHeld
        ).sub(baseTokenWithdrawnEarly[who]);

        if (allowedAmount == 0) {
            return 0;
        }

        totalBaseTokenWithdrawn =
            totalBaseTokenWithdrawn.add(allowedAmount);
        if (state == State.OPEN) {
            baseTokenWithdrawnEarly[who] =
                baseTokenWithdrawnEarly[who].add(allowedAmount);
        }

        TokenInteract.transfer(baseToken, who, allowedAmount);

        return allowedAmount;
    }

    function withdrawQuoteTokens(
        address who
    )
        internal
        returns (uint256)
    {
        if (state != State.CLOSED) {
            return 0;
        }

        uint256 currentQuoteTokenBalance = TokenInteract.balanceOf(
            quoteToken,
            address(this));

        uint256 allowedAmount = MathHelpers.getPartialAmount(
            balances[who],
            totalAmount.sub(totalAmountFullyWithdrawn),
            currentQuoteTokenBalance
        );

        if (allowedAmount == 0) {
            return 0;
        }

        TokenInteract.transfer(quoteToken, who, allowedAmount);

        return allowedAmount;
    }
}
