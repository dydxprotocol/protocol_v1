pragma solidity 0.4.23;
pragma experimental "v0.5.0";

import { ReentrancyGuard } from "zeppelin-solidity/contracts/ReentrancyGuard.sol";
import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { Margin } from "../Margin.sol";
import { MathHelpers } from "../../lib/MathHelpers.sol";
import { TokenInteract } from "../../lib/TokenInteract.sol";
import { MarginCommon } from "../impl/MarginCommon.sol";
import { ForceRecoverCollateralDelegator } from "../interfaces/ForceRecoverCollateralDelegator.sol";
import { MarginCallDelegator } from "../interfaces/MarginCallDelegator.sol";
import { OnlyMargin } from "../interfaces/OnlyMargin.sol";
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
    ReentrancyGuard,
    OnlyMargin,
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

    // ============ Constructor ============

    constructor(
        bytes32 positionId,
        address margin,
        address initialLender,
        address[] trustedLoanCallers
    )
        public
        OnlyMargin(margin)
    {
        POSITION_ID = positionId;
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
     * @param  positionId  Unique ID of the position
     * @return            This address on success, throw otherwise
     */
    function receiveLoanOwnership(
        address /* from */,
        bytes32 positionId
    )
        external
        onlyMargin
        nonReentrant
        returns (address)
    {
        // require uninitialized so that this cannot receive ownership from more than 1 loan
        require(state == State.UNINITIALIZED);
        require(POSITION_ID == positionId);

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
     * @param  from            Address that loaned the additional tokens
     * @param  positionId      Unique ID of the position
     * @param  principalAdded  Amount that was added to the position
     * @return                 True to indicate that this contract consents to value being added
     */
    function marginLoanIncreased(
        address from,
        bytes32 positionId,
        uint256 principalAdded
    )
        external
        onlyMargin
        nonReentrant
        returns (bool)
    {
        assert(positionId == POSITION_ID);

        balances[from] = balances[from].add(principalAdded);
        totalPrincipal = totalPrincipal.add(principalAdded);

        emit BalanceAdded(
            from,
            principalAdded
        );

        return true;
    }

    /**
     * Called by Margin when another address attempts to margin call the loan this contract owns
     *
     * @param  who         Address attempting to initiate the loan call
     * @param  positionId  Unique ID of the position
     *  param  (unused)
     * @return             True to consent to the loan being called if the initiator is a trusted
     *                     loan caller, false otherwise
     */
    function marginCallOnBehalfOf(
        address who,
        bytes32 positionId,
        uint256 /* depositAmount */
    )
        external
        onlyMargin
        nonReentrant
        returns (bool)
    {
        assert(state == State.OPEN);
        assert(POSITION_ID == positionId);

        return TRUSTED_MARGIN_CALLERS[who];
    }

    /**
     * Called by Margin when another address attempts to cancel a margin call for the loan
     * this contract owns
     *
     * @param  who         Address attempting to initiate the loan call cancel
     * @param  positionId  Unique ID of the position
     * @return             True to consent to the loan call being canceled if the initiator is a
     *                     trusted loan caller, false otherwise
     */
    function cancelMarginCallOnBehalfOf(
        address who,
        bytes32 positionId
    )
        external
        onlyMargin
        nonReentrant
        returns (bool)
    {
        assert(state == State.OPEN);
        assert(POSITION_ID == positionId);

        return TRUSTED_MARGIN_CALLERS[who];
    }

    /**
     * Called by Margin when another address attempts to force recover the loan
     * this contract owns. This contract will receive funds on a force recover. This contract
     * always consents to anyone initiating a force recover
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
        onlyMargin
        nonReentrant
        returns (bool)
    {
        assert(state == State.OPEN);
        assert(POSITION_ID == positionId);

        require(collateralRecipient == address(this));

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
        nonReentrant
    {
        require(state == State.OPEN || state == State.CLOSED);
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
        require(state == State.OPEN || state == State.CLOSED);
        updateStateOnClosed();

        return withdrawImpl(who);
    }

    // ============ Internal Functions ============

    function updateStateOnClosed()
        internal
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
        internal
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
        internal
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
        internal
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
