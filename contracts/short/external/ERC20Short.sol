pragma solidity 0.4.19;

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { Math } from "zeppelin-solidity/contracts/math/Math.sol";
import { ReentrancyGuard } from "zeppelin-solidity/contracts/ReentrancyGuard.sol";
import { StandardToken } from "zeppelin-solidity/contracts/token/ERC20/StandardToken.sol";
import { DetailedERC20 } from "zeppelin-solidity/contracts/token/ERC20/DetailedERC20.sol";
import { MathHelpers } from "../../lib/MathHelpers.sol";
import { StringHelpers } from "../../lib/StringHelpers.sol";
import { CloseShortDelegator } from "../interfaces/CloseShortDelegator.sol";
import { Vault } from "../Vault.sol";
import { ShortCustodian } from "./interfaces/ShortCustodian.sol";
import { ShortSellCommon } from "../impl/ShortSellCommon.sol";
import { ShortSell } from "../ShortSell.sol";
import { ShortSellHelper } from "./lib/ShortSellHelper.sol";
import { TokenInteract } from "../../lib/TokenInteract.sol";


/**
 * @title ERC20Short
 * @author dYdX
 *
 * This contract is used to tokenize short positions and allow them to be used as ERC20-compliant
 * tokens. Holding the tokens allows the holder to close a piece of the short position, or be
 * entitled to some amount of base tokens after settlement.
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

    // The ERC20Short was successfully initialized
    event Initialized(
        bytes32 shortId,
        uint256 initialSupply
    );

    // The short was completely closed and tokens can be withdrawn
    event Closed();

    // A user burns tokens in order to withdraw base tokens after the short has been closed
    event TokensRedeemedAfterForceClose(
        address indexed redeemer,
        uint256 tokensRedeemed,
        uint256 baseTokenPayout
    );

    // A user burns tokens in order to partially close the short
    event TokensRedeemedForClose(
        address indexed redeemer,
        uint256 closeAmount
    );

    // ---------------------------
    // ----- State Variables -----
    // ---------------------------

    // All tokens will initially be allocated to this address
    address public INITIAL_TOKEN_HOLDER;

    // id of the short this contract is tokenizing
    bytes32 public SHORT_ID;

    // Addresses of recipients that will fairly verify and redistribute funds from closing the short
    mapping (address => bool) public TRUSTED_RECIPIENTS;

    // Addresses of closers that are allowed to completely close the short
    mapping (address => bool) public TRUSTED_CLOSERS;

    // Current State of this contract. See State enum
    State public state;

    // Address of the short's baseToken. Cached for convenience and lower-cost withdrawals
    address public baseToken;

    // Symbol to be ERC20 compliant with frontends
    string public symbol = "DYDX-S";

    // -------------------------
    // ------ Constructor ------
    // -------------------------

    function ERC20Short(
        bytes32 shortId,
        address shortSell,
        address initialTokenHolder,
        address[] trustedClosers,
        address[] trustedRecipients
    )
        public
        CloseShortDelegator(shortSell)
    {
        SHORT_ID = shortId;
        state = State.UNINITIALIZED;
        INITIAL_TOKEN_HOLDER = initialTokenHolder;

        uint256 i;
        for (i = 0; i < trustedClosers.length; i++) {
            TRUSTED_CLOSERS[trustedClosers[i]] = true;
        }
        for (i = 0; i < trustedRecipients.length; i++) {
            TRUSTED_RECIPIENTS[trustedRecipients[i]] = true;
        }
    }

    // -----------------------------------------
    // ---- Public State Changing Functions ----
    // -----------------------------------------

    /**
     * Called by the ShortSell contract when anyone transfers ownership of a short to this contract.
     * This function initializes the tokenization of the short given and returns this address to
     * indicate to ShortSell that it is willing to take ownership of the short.
     *
     *  param  (unused)
     * @param  shortId  Unique ID of the short
     * @return this address on success, throw otherwise
     */
    function receiveShortOwnership(
        address /* from */,
        bytes32 shortId
    )
        onlyShortSell
        nonReentrant
        external
        returns (address owner)
    {
        // require uninitialized so that this cannot receive short ownership from more than 1 short
        require(state == State.UNINITIALIZED);
        require(SHORT_ID == shortId);

        ShortSellCommon.Short memory short = ShortSellHelper.getShort(SHORT_SELL, SHORT_ID);
        uint256 currentShortAmount = short.shortAmount.sub(short.closedAmount);
        require(currentShortAmount > 0);

        // set relevant constants
        state = State.OPEN;
        totalSupply_ = currentShortAmount;
        balances[INITIAL_TOKEN_HOLDER] = currentShortAmount;
        baseToken = short.baseToken;

        // Record event
        Initialized(SHORT_ID, currentShortAmount);

        // ERC20 Standard requires Transfer event from 0x0 when tokens are minted
        Transfer(address(0), INITIAL_TOKEN_HOLDER, currentShortAmount);

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
        require(state == State.OPEN);
        require(SHORT_ID == shortId);

        // Tokens are not burned when a trusted recipient is used, but we require the short to be
        // completely closed. All token holders are then entitled to the  baseTokens in the contract
        if (
            requestedAmount == totalSupply_
            && (TRUSTED_RECIPIENTS[payoutRecipient] || TRUSTED_CLOSERS[closer])
        ) {
            allowedAmount = requestedAmount;
            Closed();
        } else {
            // For non-approved closers or recipients, we check token balances for closer.
            // payoutRecipient can be whatever the token holder wants.
            uint256 balance = balances[closer];
            allowedAmount = Math.min256(requestedAmount, balance);
            require(allowedAmount > 0);
            balances[closer] = balance.sub(allowedAmount);
            totalSupply_ = totalSupply_.sub(allowedAmount);  // asserts (allowedAmount <= totalSupply_)
            TokensRedeemedForClose(closer, allowedAmount);

            if (totalSupply_ == 0) {
                Closed();
            }
        }
    }

    /**
     * Withdraw base tokens from this contract for any of the short that was closed via
     * forceRecoverLoan(). If all base tokens were returned to the lender, then this contract may
     * not be entitled to any tokens and therefore the token holders are not entitled to any tokens.
     *
     * NOTE: It is possible that this contract could be sent base token by external sources
     * other than from the ShortSell contract. In this case the payout for token holders
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
     * @return The number of tokens withdrawn
     */
    function withdraw(
        address who
    )
        nonReentrant
        external
        returns (uint256 baseTokenPayout)
    {
        uint256 value = balanceOf(who);
        require(value > 0);

        // If in OPEN state, but the short is closed, set to CLOSED state
        if (state == State.OPEN && ShortSell(SHORT_SELL).isShortClosed(SHORT_ID)) {
            state = State.CLOSED;
            Closed();
        }
        require(state == State.CLOSED);

        uint256 baseTokenBalance = TokenInteract.balanceOf(baseToken, address(this));

        // NOTE the payout must be calculated before decrementing the totalSupply below
        baseTokenPayout = MathHelpers.getPartialAmount(
            value,
            totalSupply_,
            baseTokenBalance
        );

        // Destroy the tokens
        delete balances[who];
        totalSupply_ = totalSupply_.sub(value);

        // Send the redeemer their proportion of base token
        TokenInteract.transfer(baseToken, who, baseTokenPayout);

        TokensRedeemedAfterForceClose(who, value, baseTokenPayout);
    }

    // -----------------------------------
    // ---- Public Constant Functions ----
    // -----------------------------------

    /**
     * ERC20 decimals function. Returns the same number of decimals as the short's underlyingToken
     *
     * NOTE: This is not a gas-efficient function and is not intended to be used on-chain
     *
     * @return The number of decimal places, or revert if the underlyingToken has no such function.
     */
    function decimals()
        external
        view
        returns (uint8)
    {
        return
            DetailedERC20(
                ShortSell(SHORT_SELL).getShortUnderlyingToken(SHORT_ID)
            ).decimals();
    }

    /**
     * ERC20 name function. Returns a name based off shortID. Throws if this contract does not own
     * the short.
     *
     * NOTE: This is not a gas-efficient function and is not intended to be used on-chain
     *
     * @return The name of the short token which includes the hexadecimal shortId of the short
     */
    function name()
        external
        view
        returns (string)
    {
        if (state == State.UNINITIALIZED) {
            return "dYdx Tokenized Short [UNINITIALIZED]";
        }
        // Copy intro into return value
        bytes memory intro = "dYdX Tokenized Short 0x";
        return string(StringHelpers.strcat(intro, StringHelpers.bytes32ToHex(SHORT_ID)));
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
        require(shortId == SHORT_ID);
        // Claim ownership of deed and allow token holders to withdraw funds from this contract
        return address(this);
    }
}
