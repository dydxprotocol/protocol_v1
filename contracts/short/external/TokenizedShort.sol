pragma solidity 0.4.19;

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { Math } from "zeppelin-solidity/contracts/math/Math.sol";
import { ReentrancyGuard } from "zeppelin-solidity/contracts/ReentrancyGuard.sol";
import { StandardToken } from "zeppelin-solidity/contracts/token/ERC20/StandardToken.sol";
import { DetailedERC20 } from "zeppelin-solidity/contracts/token/ERC20/DetailedERC20.sol";
import { MathHelpers } from "../../lib/MathHelpers.sol";
import { ShortCloser } from "../interfaces/ShortCloser.sol";
import { Vault } from "../Vault.sol";
import { ShortSellCommon } from "../impl/ShortSellCommon.sol";
import { ShortSell } from "../ShortSell.sol";
import { ShortSellHelper } from "./lib/ShortSellHelper.sol";
import { TokenInteract } from "../../lib/TokenInteract.sol";
import { ShortCloser } from "../interfaces/ShortCloser.sol";


/**
 * @title TokenizedShort
 * @author dYdX
 *
 * This contract is used to tokenize short positions and allow them to be used as ERC20-compliant
 * tokens. Holding the tokens allows the holder to close a piece of the short position, or be
 * entitled to some amount of base tokens after settlement.
 */
 /* solium-disable-next-line */
contract TokenizedShort is
    StandardToken,
    ShortCloser,
    ReentrancyGuard,
    TokenInteract {
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

    // A TokenizedShort was successfully initialized
    event Initialized(
        bytes32 shortId,
        uint256 initialSupply
    );

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

    // Address of the ShortSell contract
    address public SHORT_SELL;

    // All tokens will initially be allocated to this address
    address public initialTokenHolder;

    // id of the short this contract is tokenizing
    bytes32 public shortId;

    // Current State of this contract. See State enum
    State public state;

    // Address of the short's baseToken. Cached for convenience and lower-cost withdrawals
    address public baseToken;

    // Address of the short's underlyingToken. Cached for convenience
    address public underlyingToken;

    // Symbol to be ERC20 compliant with frontends
    string public symbol = "DYDXS";

    // -------------------------
    // ------ Constructor ------
    // -------------------------

    function TokenizedShort(
        address _shortSell,
        address _initialTokenHolder
    )
        public
        ShortCloser(_shortSell)
    {
        SHORT_SELL = _shortSell;
        state = State.UNINITIALIZED;
        initialTokenHolder = _initialTokenHolder;
    }

    // -----------------------------------------
    // ---- Public State Changing Functions ----
    // -----------------------------------------

    /**
     * After the short has transferred ownership to this contract, it can be initialized.
     * @param  _shortId  Unique ID of the short
     * @return true on success
     */
    function recieveShortOwnership(
        address /* _from */,
        bytes32 _shortId
    )
        onlyShortSell
        nonReentrant
        external
        returns (address owner)
    {
        // require uninitialized so that this cannot recieve short ownership from more than 1 short
        require(state == State.UNINITIALIZED);

        // set relevant constants
        state = State.OPEN;
        shortId = _shortId;

        ShortSellCommon.Short memory short = ShortSellHelper.getShort(SHORT_SELL, shortId);
        uint256 currentShortAmount = short.shortAmount.sub(short.closedAmount);
        require(currentShortAmount > 0);

        // Give the specified address the entire balance, equal to the current amount of the short
        balances[initialTokenHolder] = currentShortAmount;
        totalSupply_ = currentShortAmount;
        baseToken = short.baseToken;
        underlyingToken = short.underlyingToken;

        // Record event
        Initialized(shortId, currentShortAmount);

        // ERC20 Standard requires Transfer event from 0x0 when tokens are minted
        Transfer(address(0), initialTokenHolder, currentShortAmount);

        return address(this); // returning own address retains ownership of short
    }

    /**
     * Called by ShortSell when an owner of this token is attempting to close some of the short
     * position. Implementation is required per ShortOwner contract in order to be used by
     * ShortSell to approve closing parts of a short position. If true is returned, this contract
     * must assume that ShortSell will either revert the entire transaction or that the specified
     * amount of the short position was successfully closed.

     * @param _who              Address of the caller of the close function
     * @param _shortId          Id of the short being closed
     * @param _requestedAmount  Amount of the short being closed
     * @return _allowedAmount   The amount the user is allowed to close for the specified short
     */
    function closeOnBehalfOf(
        address _who,
        bytes32 _shortId,
        uint256 _requestedAmount
    )
        onlyShortSell
        nonReentrant
        external
        returns (uint256 _allowedAmount)
    {
        require(msg.sender == SHORT_SELL);
        require(state == State.OPEN);

        // not a necessary check, but we include shortId in the parameters in case a single contract
        // acts as the seller for multiple short positions
        require(_shortId == shortId);

        // to be more general, we prefer to return the amount closed rather than revert
        uint256 amount = Math.min256(_requestedAmount, balances[_who]);
        if (amount == 0) {
            return 0;
        }

        // subtract from balances
        uint256 balance = balances[_who];
        require(amount <= balance);
        balances[_who] = balance.sub(amount);
        totalSupply_ = totalSupply_.sub(amount);  // also asserts (amount <= totalSupply_)

        TokensRedeemedForClose(_who, amount);
        return amount;
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
        returns (uint256 _payout)
    {
        uint256 value = balanceOf(who);
        require(value > 0);

        // If in OPEN state, but the short is closed, set to CLOSED state
        if (state == State.OPEN && ShortSell(SHORT_SELL).isShortClosed(shortId)) {
            state = State.CLOSED;
        }
        require(state == State.CLOSED);

        uint256 baseTokenBalance = balanceOf(baseToken, address(this));

        // NOTE the payout must be calculated before decrementing the totalSupply below
        uint256 baseTokenPayout = MathHelpers.getPartialAmount(
            value,
            totalSupply_,
            baseTokenBalance
        );

        // Destroy the tokens
        delete balances[who];
        totalSupply_ = totalSupply_.sub(value);

        // Send the redeemer their proportion of base token
        transfer(baseToken, who, baseTokenPayout);

        TokensRedeemedAfterForceClose(who, value, baseTokenPayout);
        return baseTokenPayout;
    }

    // -----------------------------------
    // ---- Public Constant Functions ----
    // -----------------------------------

    /**
     * To be compliant with ERC20, we have a decimals function that will return the same value
     * as the underlyingToken of the short.
     *
     * @return The number of decimal places, or revert if the underlyingToken has no such function.
     */
    function decimals()
        external
        view
        returns (uint8 _decimals)
    {
        // Return the decimals place of the underlying token of the short sell.
        // We do not store this value because it should just be for display purposes and should not
        // block the tokenization of the short if decimals() is not a function on the underlying
        // ERC20 token.
        return
            DetailedERC20(
                ShortSell(SHORT_SELL).getShortUnderlyingToken(shortId)
            ).decimals();
    }

    /**
     * To be compliant with ERC20, we have a name function that will return the shortId as the name.
     *
     * NOTE: This is not a gas-efficient function and is not intended to be used on-chain
     *
     * @return The name of the short token which includes the hexadecimal shortId of the short
     */
    function name()
        external
        view
        returns (string _name)
    {
        if (shortId == bytes32(0)) {
            return "dYdx Tokenized Short [UNINITIALIZED]";
        }
        // Copy intro into return value
        bytes memory intro = "dYdX Tokenized Short 0x";
        uint256 introLength = intro.length;
        bytes memory bytesString = new bytes(introLength + 64);
        for (uint k = 0; k < introLength; k++) {
            bytesString[k] = intro[k];
        }

        // Copy shortId into bytes array (in hexadecimal form)
        uint256 temp = uint256(shortId);
        for (uint8 j = 0; j < 32; j++) {
            uint256 jthByte = temp / uint256(uint256(2) ** uint256(248-8*j));
            uint8 fourBit1 = uint8(jthByte) / uint8(16);
            uint8 fourBit2 = uint8(jthByte) % uint8(16);
            fourBit1 += (fourBit1 > 9) ? 87 : 48; // shift into proper ascii value
            fourBit2 += (fourBit2 > 9) ? 87 : 48; // shift into proper ascii value
            bytesString[introLength + 2 * j] = byte(fourBit1);
            bytesString[introLength + 2 * j + 1] = byte(fourBit2);
        }

        return string(bytesString);
    }
}
