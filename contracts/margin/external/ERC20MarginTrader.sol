pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { ReentrancyGuard } from "zeppelin-solidity/contracts/ReentrancyGuard.sol";
import { Math } from "zeppelin-solidity/contracts/math/Math.sol";
import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { DetailedERC20 } from "zeppelin-solidity/contracts/token/ERC20/DetailedERC20.sol";
import { StandardToken } from "zeppelin-solidity/contracts/token/ERC20/StandardToken.sol";
import { Margin } from "../Margin.sol";
import { MathHelpers } from "../../lib/MathHelpers.sol";
import { StringHelpers } from "../../lib/StringHelpers.sol";
import { TokenInteract } from "../../lib/TokenInteract.sol";
import { MarginCommon } from "../impl/MarginCommon.sol";
import { ClosePositionDelegator } from "../interfaces/ClosePositionDelegator.sol";
import { TraderCustodian } from "./interfaces/TraderCustodian.sol";
import { MarginHelper } from "./lib/MarginHelper.sol";


/**
 * @title ERC20MarginTrader
 * @author dYdX
 *
 * Contract used to tokenize margin positions and allow them to be used as ERC20-compliant
 * tokens. Holding the tokens allows the holder to close a piece of the margin position, or be
 * entitled to some amount of quote tokens after settlement.
 */
 /* solium-disable-next-line */
contract ERC20MarginTrader is
    StandardToken,
    ClosePositionDelegator,
    TraderCustodian,
    ReentrancyGuard {
    using SafeMath for uint256;

    // ============ Enums ============

    enum State {
        UNINITIALIZED,
        OPEN,
        CLOSED
    }

    // ============ Events ============

    /**
     * This ERC20MarginTrader was successfully initialized
     */
    event Initialized(
        bytes32 marginId,
        uint256 initialSupply
    );

    /**
     * The position was completely closed and tokens can be withdrawn
     */
    event ClosedByTrustedParty(
        address closer,
        address payoutRecipient,
        uint256 closeAmount
    );

    /**
     * The position was completely closed and tokens can be withdrawn
     */
    event CompletelyClosed();

    /**
     * User burned tokens to withdraw quote tokens from this contract after the position was closed
     */
    event TokensRedeemedAfterForceClose(
        address indexed redeemer,
        uint256 tokensRedeemed,
        uint256 quoteTokenPayout
    );

    /**
     * A user burned tokens in order to partially close the position
     */
    event TokensRedeemedForClose(
        address indexed redeemer,
        uint256 closeAmount
    );


    // ============ State Variables ============

    // All tokens will initially be allocated to this address
    address public INITIAL_TOKEN_HOLDER;

    // Unique ID of the margin position this contract is tokenizing
    bytes32 public MARGIN_ID;

    // Addresses of recipients that will fairly verify and redistribute funds from a position close
    mapping (address => bool) public TRUSTED_RECIPIENTS;

    // Current State of this contract. See State enum
    State public state;

    // Address of the position's quoteToken. Cached for convenience and lower-cost withdrawals
    address public quoteToken;

    // Symbol to be ERC20 compliant with frontends
    string public symbol = "DYDX-S";

    // ============ Constructor ============

    function ERC20MarginTrader(
        bytes32 marginId,
        address margin,
        address initialTokenHolder,
        address[] trustedRecipients
    )
        public
        ClosePositionDelegator(margin)
    {
        MARGIN_ID = marginId;
        state = State.UNINITIALIZED;
        INITIAL_TOKEN_HOLDER = initialTokenHolder;

        for (uint256 i = 0; i < trustedRecipients.length; i++) {
            TRUSTED_RECIPIENTS[trustedRecipients[i]] = true;
        }
    }

    // ============ Margin-Only Functions ============

    /**
     * Called by Margin when anyone transfers ownership of a position to this contract.
     * This function initializes the tokenization of the margin position given and returns this
     * address to indicate to Margin that it is willing to take ownership of the margin position.
     *
     *  param  (unused)
     * @param  marginId  Unique ID of the margin position
     * @return           This address on success, throw otherwise
     */
    function receiveOwnershipAsTrader(
        address /* from */,
        bytes32 marginId
    )
        onlyMargin
        nonReentrant
        external
        returns (address)
    {
        // require uninitialized so that this cannot receive ownership from more than 1 position
        require(state == State.UNINITIALIZED);
        require(MARGIN_ID == marginId);

        MarginCommon.Position memory position = MarginHelper.getPosition(MARGIN, MARGIN_ID);
        uint256 currentPositionAmount = position.amount.sub(position.closedAmount);
        assert(currentPositionAmount > 0);

        // set relevant constants
        state = State.OPEN;
        totalSupply_ = currentPositionAmount;
        balances[INITIAL_TOKEN_HOLDER] = currentPositionAmount;
        quoteToken = position.quoteToken;

        // Record event
        emit Initialized(MARGIN_ID, currentPositionAmount);

        // ERC20 Standard requires Transfer event from 0x0 when tokens are minted
        emit Transfer(address(0), INITIAL_TOKEN_HOLDER, currentPositionAmount);

        return address(this); // returning own address retains ownership of the position
    }

    /**
     * Called by Margin when additional value is added onto the margin position this contract
     * owns. Tokens are minted and assigned to the address that added the value.
     *
     * @param  from         Address that added the value to the margin position
     * @param  marginId     Unique ID of the margin position
     * @param  amountAdded  Amount that was added to the position
     * @return              True to indicate that this contract consents to value being added
     */
    function marginPositionIncreased(
        address from,
        bytes32 marginId,
        uint256 amountAdded
    )
        onlyMargin
        nonReentrant
        external
        returns (bool)
    {
        assert(marginId == MARGIN_ID);

        balances[from] = balances[from].add(amountAdded);
        totalSupply_ = totalSupply_.add(amountAdded);

        // ERC20 Standard requires Transfer event from 0x0 when tokens are minted
        emit Transfer(address(0), from, amountAdded);

        return true;
    }

    /**
     * Called by Margin when an owner of this token is attempting to close some of the margin
     * position. Implementation is required per TraderOwner contract in order to be used by
     * Margin to approve closing parts of a margin position. If true is returned, this contract
     * must assume that Margin will either revert the entire transaction or that the specified
     * amount of the margin position was successfully closed.
     *
     * @param closer           Address of the caller of the close function
     * @param payoutRecipient  Address of the recipient of any quote tokens paid out
     * @param marginId         Unique ID of the margin position
     * @param requestedAmount  Amount of the margin position being closed
     * @return                 The amount the user is allowed to close for the specified position
     */
    function closePositionOnBehalfOf(
        address closer,
        address payoutRecipient,
        bytes32 marginId,
        uint256 requestedAmount
    )
        onlyMargin
        nonReentrant
        external
        returns (uint256)
    {
        assert(state == State.OPEN);
        assert(MARGIN_ID == marginId);

        uint256 allowedAmount;

        // Tokens are not burned when a trusted recipient is used, but we require the position to be
        // completely closed. All token holders are then entitled to the quoteTokens in the contract
        if (requestedAmount >= totalSupply_ && TRUSTED_RECIPIENTS[payoutRecipient]) {
            allowedAmount = requestedAmount;
            emit ClosedByTrustedParty(closer, payoutRecipient, requestedAmount);
            state = State.CLOSED;
            emit CompletelyClosed();
        } else {
            // For non-approved closers or recipients, we check token balances for closer.
            // payoutRecipient can be whatever the token holder wants.
            uint256 balance = balances[closer];
            allowedAmount = Math.min256(requestedAmount, balance);
            require(allowedAmount > 0);
            balances[closer] = balance.sub(allowedAmount);
            totalSupply_ = totalSupply_.sub(allowedAmount);
            emit TokensRedeemedForClose(closer, allowedAmount);

            if (totalSupply_ == 0) {
                state = State.CLOSED;
                emit CompletelyClosed();
            }
        }

        return allowedAmount;
    }

    // ============ Public State Changing Functions ============

    /**
     * Withdraw quote tokens from this contract for any of the margin position that was closed via
     * external means (such as an auction-closing mechanism).
     *
     * NOTE: It is possible that this contract could be sent quote token by external sources
     * other than from the Margin contract. In this case the payout for token holders
     * would be greater than just that from the closePosition payout. This is fine because
     * nobody has incentive to send this contract extra funds, and if they do then it's
     * also fine just to let the token holders have it.
     *
     * NOTE: If there are significant rounding errors, then it is possible that withdrawing later is
     * more advantageous. An "attack" could involve withdrawing for others before withdrawing for
     * yourself. Likely, rounding error will be small enough to not properly incentivize people to
     * carry out such an attack.
     *
     * @param  who  Address of the account to withdraw for
     * @return      The number of quote tokens withdrawn
     */
    function withdraw(
        address who
    )
        nonReentrant
        external
        returns (uint256)
    {
        // If in OPEN state, but the position is closed, set to CLOSED state
        if (state == State.OPEN && Margin(MARGIN).isPositionClosed(MARGIN_ID)) {
            state = State.CLOSED;
            emit CompletelyClosed();
        }
        require(state == State.CLOSED);

        uint256 value = balanceOf(who);

        if (value == 0) {
            return 0;
        }

        uint256 quoteTokenBalance = TokenInteract.balanceOf(quoteToken, address(this));

        // NOTE the payout must be calculated before decrementing the totalSupply below
        uint256 quoteTokenPayout = MathHelpers.getPartialAmount(
            value,
            totalSupply_,
            quoteTokenBalance
        );

        // Destroy the tokens
        delete balances[who];
        totalSupply_ = totalSupply_.sub(value);

        // Send the redeemer their proportion of quote token
        TokenInteract.transfer(quoteToken, who, quoteTokenPayout);

        emit TokensRedeemedAfterForceClose(who, value, quoteTokenPayout);

        return quoteTokenPayout;
    }

    //  Public Constant Functions ============

    /**
     * ERC20 decimals function. Returns the same number of decimals as the position's baseToken
     *
     * NOTE: This is not a gas-efficient function and is not intended to be used on-chain
     *
     * @return  The number of decimal places, or revert if the baseToken has no such function.
     */
    function decimals()
        external
        view
        returns (uint8)
    {
        return
            DetailedERC20(
                Margin(MARGIN).getPositionBaseToken(MARGIN_ID)
            ).decimals();
    }

    /**
     * ERC20 name function. Returns a name based off positionID. Throws if this contract does not
     * own the position.
     *
     * NOTE: This is not a gas-efficient function and is not intended to be used on-chain
     *
     * @return  The name of the margin position token which includes the hexadecimal marginId
     */
    function name()
        external
        view
        returns (string)
    {
        if (state == State.UNINITIALIZED) {
            return "dYdX Tokenized Margin Position [UNINITIALIZED]";
        }
        // Copy intro into return value
        bytes memory intro = "dYdX Tokenized Margin Position 0x";
        return string(StringHelpers.strcat(intro, StringHelpers.bytes32ToHex(MARGIN_ID)));
    }

    /**
     * Implements TraderCustodian functionality. Called by external contracts to see where to pay
     * tokens as a result of closing a position on behalf of this contract
     *
     * @param  marginId  Unique ID of the margin position
     * @return           Address of this contract. Indicates funds should be sent to this contract
     */
    function getPositionDeedHolder(
        bytes32 marginId
    )
        external
        view
        returns (address)
    {
        require(marginId == MARGIN_ID);
        // Claim ownership of deed and allow token holders to withdraw funds from this contract
        return address(this);
    }
}
