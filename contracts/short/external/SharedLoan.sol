pragma solidity 0.4.19;

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { ReentrancyGuard } from "zeppelin-solidity/contracts/ReentrancyGuard.sol";
import { MathHelpers } from "../../lib/MathHelpers.sol";
import { CallLoanDelegator } from "../interfaces/CallLoanDelegator.sol";
import { ForceRecoverLoanDelegator } from "../interfaces/ForceRecoverLoanDelegator.sol";
import { LoanOwner } from "../interfaces/LoanOwner.sol";
import { ShortSellHelper } from "./lib/ShortSellHelper.sol";
import { TokenInteract } from "../../lib/TokenInteract.sol";
import { ShortSellCommon } from "../impl/ShortSellCommon.sol";


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
        uint256 amount
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

    uint256 public totalAmount;
    uint256 public totalWithdrawn;

    mapping (address => uint256) public balances;

    mapping (address => uint256) public amountWithdrawn;

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
        LoanOwner(shortSell)
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

        // Record event
        Initialized(SHORT_ID, currentShortAmount);

        BalanceAdded(
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
        updateStateOnClosed();
        require(state == State.OPEN || state == State.CLOSED);

        return (
            withdrawUnderlyingTokens(who),
            withdrawBaseTokens(who)
        );
    }

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

        uint256 totalUnderlyingEverHeld = currentUnderlyingTokenBalance.add(totalWithdrawn);

        uint256 allowedAmount = MathHelpers.getPartialAmount(
            balances[who],
            totalAmount,
            totalUnderlyingEverHeld
        ).sub(amountWithdrawn[who]);

        if (allowedAmount == 0) {
            return 0;
        }

        amountWithdrawn[who] = amountWithdrawn[who].add(allowedAmount);
        totalWithdrawn = totalWithdrawn.add(allowedAmount);

        TokenInteract.transfer(underlyingToken, who, allowedAmount);

        TokensWithdrawn(
            who,
            allowedAmount
        );

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


    }
}
