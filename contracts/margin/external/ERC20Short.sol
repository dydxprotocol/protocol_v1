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
import { CloseShortDelegator } from "../interfaces/CloseShortDelegator.sol";
import { ShortCustodian } from "./interfaces/ShortCustodian.sol";
import { MarginHelper } from "./lib/MarginHelper.sol";


/**
 * @title ERC20Short
 * @author dYdX
 *
 * Contract used to tokenize short positions and allow them to be used as ERC20-compliant
 * tokens. Holding the tokens allows the holder to close a piece of the short position, or be
 * entitled to some amount of quote tokens after settlement.
 */
 /* solium-disable-next-line */
contract ERC20Short is
    StandardToken,
    CloseShortDelegator,
    ShortCustodian,
    ReentrancyGuard {
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
     * This ERC20Short was successfully initialized
     */
    event Initialized(
        bytes32 shortId,
        uint256 initialSupply
    );

    /**
     * The short was completely closed and tokens can be withdrawn
     */
    event ClosedByTrustedParty(
        address closer,
        address payoutRecipient,
        uint256 closeAmount
    );

    /**
     * The short was completely closed and tokens can be withdrawn
     */
    event CompletelyClosed();

    /**
     * A user burned tokens to withdraw quote tokens from this contract after the short was closed
     */
    event TokensRedeemedAfterForceClose(
        address indexed redeemer,
        uint256 tokensRedeemed,
        uint256 quoteTokenPayout
    );

    /**
     * A user burned tokens in order to partially close the short
     */
    event TokensRedeemedForClose(
        address indexed redeemer,
        uint256 closeAmount
    );

    // ---------------------------
    // ----- State Variables -----
    // ---------------------------

    // All tokens will initially be allocated to this address
    address public INITIAL_TOKEN_HOLDER;

    // Unique ID of the short this contract is tokenizing
    bytes32 public SHORT_ID;

    // Addresses of recipients that will fairly verify and redistribute funds from closing the short
    mapping (address => bool) public TRUSTED_RECIPIENTS;

    // Current State of this contract. See State enum
    State public state;

    // Address of the short's quoteToken. Cached for convenience and lower-cost withdrawals
    address public quoteToken;

    // Symbol to be ERC20 compliant with frontends
    string public symbol = "DYDX-S";

    // -------------------------
    // ------ Constructor ------
    // -------------------------

    function ERC20Short(
        bytes32 shortId,
        address margin,
        address initialTokenHolder,
        address[] trustedRecipients
    )
        public
        CloseShortDelegator(margin)
    {
        SHORT_ID = shortId;
        state = State.UNINITIALIZED;
        INITIAL_TOKEN_HOLDER = initialTokenHolder;

        for (uint256 i = 0; i < trustedRecipients.length; i++) {
            TRUSTED_RECIPIENTS[trustedRecipients[i]] = true;
        }
    }

    // -------------------------------------
    // ----- Short Sell Only Functions -----
    // -------------------------------------

    /**
     * Called by Margin when anyone transfers ownership of a short to this contract.
     * This function initializes the tokenization of the short given and returns this address to
     * indicate to Margin that it is willing to take ownership of the short.
     *
     *  param  (unused)
     * @param  shortId  Unique ID of the short
     * @return          This address on success, throw otherwise
     */
    function receiveShortOwnership(
        address /* from */,
        bytes32 shortId
    )
        onlyMargin
        nonReentrant
        external
        returns (address)
    {
        // require uninitialized so that this cannot receive short ownership from more than 1 short
        require(state == State.UNINITIALIZED);
        require(SHORT_ID == shortId);

        MarginCommon.Short memory short = MarginHelper.getShort(MARGIN, SHORT_ID);
        uint256 currentShortAmount = short.shortAmount.sub(short.closedAmount);
        assert(currentShortAmount > 0);

        // set relevant constants
        state = State.OPEN;
        totalSupply_ = currentShortAmount;
        balances[INITIAL_TOKEN_HOLDER] = currentShortAmount;
        quoteToken = short.quoteToken;

        // Record event
        emit Initialized(SHORT_ID, currentShortAmount);

        // ERC20 Standard requires Transfer event from 0x0 when tokens are minted
        emit Transfer(address(0), INITIAL_TOKEN_HOLDER, currentShortAmount);

        return address(this); // returning own address retains ownership of short
    }

    /**
     * Called by Margin when additional value is added onto the short position this contract
     * owns. Tokens are minted and assigned to the address that added the value.
     *
     * @param  from         Address that added the value to the short position
     * @param  shortId      Unique ID of the short
     * @param  amountAdded  Amount that was added to the short
     * @return              True to indicate that this contract consents to value being added
     */
    function additionalShortValueAdded(
        address from,
        bytes32 shortId,
        uint256 amountAdded
    )
        onlyMargin
        nonReentrant
        external
        returns (bool)
    {
        assert(shortId == SHORT_ID);

        balances[from] = balances[from].add(amountAdded);
        totalSupply_ = totalSupply_.add(amountAdded);

        // ERC20 Standard requires Transfer event from 0x0 when tokens are minted
        emit Transfer(address(0), from, amountAdded);

        return true;
    }

    /**
     * Called by Margin when an owner of this token is attempting to close some of the short
     * position. Implementation is required per ShortOwner contract in order to be used by
     * Margin to approve closing parts of a short position. If true is returned, this contract
     * must assume that Margin will either revert the entire transaction or that the specified
     * amount of the short position was successfully closed.
     *
     * @param closer           Address of the caller of the close function
     * @param payoutRecipient  Address of the recipient of any quote tokens paid out
     * @param shortId          Unique ID of the short
     * @param requestedAmount  Amount of the short being closed
     * @return                 The amount the user is allowed to close for the specified short
     */
    function closeOnBehalfOf(
        address closer,
        address payoutRecipient,
        bytes32 shortId,
        uint256 requestedAmount
    )
        onlyMargin
        nonReentrant
        external
        returns (uint256)
    {
        assert(state == State.OPEN);
        assert(SHORT_ID == shortId);

        uint256 allowedAmount;

        // Tokens are not burned when a trusted recipient is used, but we require the short to be
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

    // -----------------------------------------
    // ---- Public State Changing Functions ----
    // -----------------------------------------

    /**
     * Withdraw quote tokens from this contract for any of the short that was closed via external
     * means (such as an auction-closing mechanism)
     *
     * NOTE: It is possible that this contract could be sent quote token by external sources
     * other than from the Margin contract. In this case the payout for token holders
     * would be greater than just that from the short sell payout. This is fine because
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
        // If in OPEN state, but the short is closed, set to CLOSED state
        if (state == State.OPEN && Margin(MARGIN).isShortClosed(SHORT_ID)) {
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

    // -----------------------------------
    // ---- Public Constant Functions ----
    // -----------------------------------

    /**
     * ERC20 decimals function. Returns the same number of decimals as the short's baseToken
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
                Margin(MARGIN).getShortBaseToken(SHORT_ID)
            ).decimals();
    }

    /**
     * ERC20 name function. Returns a name based off shortID. Throws if this contract does not own
     * the short.
     *
     * NOTE: This is not a gas-efficient function and is not intended to be used on-chain
     *
     * @return  The name of the short token which includes the hexadecimal shortId of the short
     */
    function name()
        external
        view
        returns (string)
    {
        if (state == State.UNINITIALIZED) {
            return "dYdX Tokenized Short [UNINITIALIZED]";
        }
        // Copy intro into return value
        bytes memory intro = "dYdX Tokenized Short 0x";
        return string(StringHelpers.strcat(intro, StringHelpers.bytes32ToHex(SHORT_ID)));
    }

    /**
     * Implements ShortCustodian functionality. Called by external contracts to see where to pay
     * tokens as a result of closing a short on behalf of this contract
     *
     * @param  shortId  Unique ID of the short
     * @return          Address of this contract. Indicates funds should be sent to this contract
     */
    function getMarginDeedHolder(
        bytes32 shortId
    )
        external
        view
        returns (address)
    {
        require(shortId == SHORT_ID);
        // Claim ownership of deed and allow token holders to withdraw funds from this contract
        return address(this);
    }
}
