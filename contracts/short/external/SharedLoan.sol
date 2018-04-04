pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { ReentrancyGuard } from "zeppelin-solidity/contracts/ReentrancyGuard.sol";
import { MathHelpers } from "../../lib/MathHelpers.sol";
import { CallLoanDelegator } from "../interfaces/CallLoanDelegator.sol";
import { ForceRecoverLoanDelegator } from "../interfaces/ForceRecoverLoanDelegator.sol";
import { LoanOwner } from "../interfaces/LoanOwner.sol";
import { ShortSellHelper } from "./lib/ShortSellHelper.sol";
import { TokenInteract } from "../../lib/TokenInteract.sol";
import { ShortSellCommon } from "../impl/ShortSellCommon.sol";
import { ShortSell } from "../ShortSell.sol";


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
    CallLoanDelegator,
    ForceRecoverLoanDelegator,
    ReentrancyGuard
{
    using SafeMath for uint256;

    // -----------------------
    // -------- Enums --------
    // -----------------------

    enum State {
        UNINITIALIZED,
        OPEN,
        CLOSED
    }

    // ------------------------
    // -------- Events --------
    // ------------------------

    /**
     * This SharedLoan was successfully initialized
     */
    event Initialized(
        bytes32 shortId,
        uint256 initialAmount
    );

    event BalanceAdded(
        address indexed who,
        uint256 amount
    );

    event TokensWithdrawn(
        address indexed who,
        uint256 underlyingTokenAmount,
        uint256 baseTokenAmount
    );

    // ---------------------------
    // ----- State Variables -----
    // ---------------------------

    // Initial lender of the position
    address public INITIAL_LENDER;

    // id of the short this contract is lending for
    bytes32 public SHORT_ID;

    // Addresses that can call in the loan
    mapping (address => bool) public TRUSTED_LOAN_CALLERS;

    // Current State of this contract. See State enum
    State public state;

    // Address of the short's underlyingToken. Cached for convenience and lower-cost withdrawals
    address public underlyingToken;
    address public baseToken;

    uint256 public totalAmount;
    uint256 public totalAmountFullyWithdrawn;
    uint256 public totalUnderlyingTokenWithdrawn;

    mapping (address => uint256) public balances;

    mapping (address => uint256) public underlyingTokenWithdrawnEarly;

    // -------------------------
    // ------ Constructor ------
    // -------------------------

    function SharedLoan(
        bytes32 shortId,
        address shortSell,
        address initialLender,
        address[] trustedLoanCallers
    )
        public
        ForceRecoverLoanDelegator(shortSell)
        CallLoanDelegator(shortSell)
    {
        SHORT_ID = shortId;
        state = State.UNINITIALIZED;
        INITIAL_LENDER = initialLender;

        for (uint256 i = 0; i < trustedLoanCallers.length; i++) {
            TRUSTED_LOAN_CALLERS[trustedLoanCallers[i]] = true;
        }
    }

    // -------------------------------------
    // ----- Short Sell Only Functions -----
    // -------------------------------------

    /**
     * Called by the ShortSell contract when anyone transfers ownership of a short to this contract.
     * This function initializes the tokenization of the short given and returns this address to
     * indicate to ShortSell that it is willing to take ownership of the short.
     *
     *  param  (unused)
     * @param  shortId  Unique ID of the short
     * @return          this address on success, throw otherwise
     */
    function receiveLoanOwnership(
        address /* from */,
        bytes32 shortId
    )
        onlyShortSell
        nonReentrant
        external
        returns (address)
    {
        // require uninitialized so that this cannot receive short ownership from more than 1 short
        require(state == State.UNINITIALIZED);
        require(SHORT_ID == shortId);

        ShortSellCommon.Short memory short = ShortSellHelper.getShort(SHORT_SELL, SHORT_ID);
        uint256 currentShortAmount = short.shortAmount.sub(short.closedAmount);
        assert(currentShortAmount > 0);

        // set relevant constants
        state = State.OPEN;
        totalAmount = currentShortAmount;
        balances[INITIAL_LENDER] = currentShortAmount;
        underlyingToken = short.underlyingToken;
        baseToken = short.baseToken;

        // Record event
        emit Initialized(SHORT_ID, currentShortAmount);

        emit BalanceAdded(
            INITIAL_LENDER,
            currentShortAmount
        );

        return address(this); // returning own address retains ownership of loan
    }

    function additionalLoanValueAdded(
        address from,
        bytes32 shortId,
        uint256 amountAdded
    )
        onlyShortSell
        nonReentrant
        external
        returns (bool)
    {
        require(shortId == SHORT_ID);

        balances[from] = balances[from].add(amountAdded);
        totalAmount = totalAmount.add(amountAdded);

        return true;
    }

    function callOnBehalfOf(
        address who,
        bytes32 shortId,
        uint256 /* depositAmount */
    )
        onlyShortSell
        nonReentrant
        external
        returns (bool)
    {
        assert(state == State.OPEN);
        assert(SHORT_ID == shortId);

        return TRUSTED_LOAN_CALLERS[who];
    }

    function cancelLoanCallOnBehalfOf(
        address who,
        bytes32 shortId
    )
        onlyShortSell
        nonReentrant
        external
        returns (bool)
    {
        assert(state == State.OPEN);
        assert(SHORT_ID == shortId);

        return TRUSTED_LOAN_CALLERS[who];
    }

    function forceRecoverLoanOnBehalfOf(
        address /* who */,
        bytes32 shortId
    )
        onlyShortSell
        nonReentrant
        external
        returns (bool)
    {
        assert(state == State.OPEN);
        assert(SHORT_ID == shortId);

        state = State.CLOSED;

        return true;
    }

    // -----------------------------------------
    // ---- Public State Changing Functions ----
    // -----------------------------------------

    function withdraw(
        address who
    )
        nonReentrant
        external
        returns (
            uint256 _underlyingTokenPayout,
            uint256 _baseTokenPayout
        )
    {
        require(state == State.OPEN || state == State.CLOSED);

        updateStateOnClosed();

        if (balances[who] == 0) {
            return (0, 0);
        }

        uint256 underlyingTokenWithdrawn = withdrawUnderlyingTokens(who);
        uint256 baseTokenWithdrawn = withdrawBaseTokens(who);

        if (state == State.CLOSED) {
            totalAmountFullyWithdrawn = totalAmountFullyWithdrawn.add(balances[who]);
            balances[who] = 0;
        }

        emit TokensWithdrawn(
            who,
            underlyingTokenWithdrawn,
            baseTokenWithdrawn
        );

        return (
            underlyingTokenWithdrawn,
            baseTokenWithdrawn
        );
    }

    // --------------------------------
    // ------ Internal Functions ------
    // --------------------------------

    function updateStateOnClosed()
        internal
    {
        if (state != State.CLOSED) {
            if (ShortSell(SHORT_SELL).isShortClosed(SHORT_ID)) {
                state = State.CLOSED;
            }
        }
    }

    function withdrawUnderlyingTokens(
        address who
    )
        internal
        returns (uint256)
    {
        uint256 currentUnderlyingTokenBalance = TokenInteract.balanceOf(
            underlyingToken,
            address(this));

        uint256 totalUnderlyingTokenEverHeld = currentUnderlyingTokenBalance.add(
            totalUnderlyingTokenWithdrawn);

        uint256 allowedAmount = MathHelpers.getPartialAmount(
            balances[who],
            totalAmount,
            totalUnderlyingTokenEverHeld
        ).sub(underlyingTokenWithdrawnEarly[who]);

        if (allowedAmount == 0) {
            return 0;
        }

        totalUnderlyingTokenWithdrawn =
            totalUnderlyingTokenWithdrawn.add(allowedAmount);
        if (state == State.OPEN) {
            underlyingTokenWithdrawnEarly[who] =
                underlyingTokenWithdrawnEarly[who].add(allowedAmount);
        }

        TokenInteract.transfer(underlyingToken, who, allowedAmount);

        return allowedAmount;
    }

    function withdrawBaseTokens(
        address who
    )
        internal
        returns (uint256)
    {
        if (state != State.CLOSED) {
            return 0;
        }

        uint256 currentBaseTokenBalance = TokenInteract.balanceOf(
            baseToken,
            address(this));

        uint256 allowedAmount = MathHelpers.getPartialAmount(
            balances[who],
            totalAmount.sub(totalAmountFullyWithdrawn),
            currentBaseTokenBalance
        );

        if (allowedAmount == 0) {
            return 0;
        }

        TokenInteract.transfer(baseToken, who, allowedAmount);

        return allowedAmount;
    }
}
