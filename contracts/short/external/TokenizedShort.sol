pragma solidity 0.4.19;

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { Math } from "zeppelin-solidity/contracts/math/Math.sol";
import { ReentrancyGuard } from "zeppelin-solidity/contracts/ReentrancyGuard.sol";
import { StandardToken } from "zeppelin-solidity/contracts/token/ERC20/StandardToken.sol";
import { DetailedERC20 } from "zeppelin-solidity/contracts/token/ERC20/DetailedERC20.sol";
import { MathHelpers } from "../../lib/MathHelpers.sol";
import { CloseShortVerifier } from "../interfaces/CloseShortVerifier.sol";
import { Vault } from "../vault/Vault.sol";
import { SafetyDepositBox } from "../vault/SafetyDepositBox.sol";
import { ShortSellCommon } from "../impl/ShortSellCommon.sol";
import { ShortSell } from "../ShortSell.sol";
import { ShortSellRepo } from "../ShortSellRepo.sol";


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
    CloseShortVerifier,
    ReentrancyGuard
{
    using SafeMath for uint;

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

    // A user burns tokens in order to withdraw base tokens after the short has been closed
    event TokensRedeemedForBaseTokens(
        address indexed redeemer,
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

    // Address of the SafetyDepositBox contract
    address public SAFETY_DEPOSIT_BOX;

    // All tokens will initially be allocated to this address
    address public initialTokenHolder;

    // id of the short this contract is tokenizing
    bytes32 public shortId;

    // Current State of this contract. See State enum
    State public state;

    // Name of this token (as ERC20 standard)
    string public name;

    // Symbol of this token (as ERC20 standard)
    string public symbol;

    // Address of the baseToken
    address public baseToken;

    // -------------------------
    // ------ Constructor ------
    // -------------------------

    function TokenizedShort(
        address _shortSell,
        address _initialTokenHolder,
        bytes32 _shortId,
        string _name,
        string _symbol
    )
        public
    {
        SHORT_SELL = _shortSell;
        SAFETY_DEPOSIT_BOX = Vault(ShortSell(SHORT_SELL).VAULT()).SAFETY_DEPOSIT_BOX();
        state = State.UNINITIALIZED;
        shortId = _shortId;
        name = _name;
        symbol = _symbol;
        initialTokenHolder = _initialTokenHolder;
    }

    // -----------------------------------------
    // ---- Public State Changing Functions ----
    // -----------------------------------------

    /**
     * After the short's "seller" field has been set to the address of this contract, this contract
     * can be called by anyone in order to set the contract to a usable state and to mint tokens
     * given to initialTokenHolder.
     */
    function initialize()
        nonReentrant
        external
    {
        require(state == State.UNINITIALIZED);
        ShortSellCommon.Short memory short =
            ShortSellCommon.getShortObject(ShortSell(SHORT_SELL).REPO(), shortId);
        uint currentShortAmount = short.shortAmount.sub(short.closedAmount);

        // The ownership of the short must be transferred to this contract before intialization
        // Once ownership is transferred, there is no way to have this contract transfer it back
        // to the original short seller. Therefore, the short seller transferring ownership should
        // verify that the initialTokenHolder field is properly set so that they recieve the tokens.
        require(short.seller == address(this));
        require(currentShortAmount > 0);

        // Give the specified address the entire balance, equal to the current amount of the short
        balances[initialTokenHolder] = currentShortAmount;
        totalSupply_ = currentShortAmount;
        baseToken = short.baseToken;
        state = State.OPEN;

        // ERC20 Standard requires Transfer event from 0x0 when tokens are minted
        Transfer(address(0), initialTokenHolder, currentShortAmount);
    }

    /**
     * Called by ShortSell when an owner of this token is attempting to close some of the short
     * position. Implementation is required per CloseShortVerifier contract in order to be used by
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
        nonReentrant
        external
        returns (uint256 _success)
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
        require(amount <= balances[_who]);
        balances[_who] = balances[_who].sub(amount);
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

        uint256 baseTokenBalance =
            SafetyDepositBox(SAFETY_DEPOSIT_BOX).withdrawableBalances(address(this), baseToken);

        // NOTE the payout must be calculated before decrementing the totalSupply below
        uint256 baseTokenPayout = MathHelpers.getPartialAmount(
            value,
            totalSupply_,
            baseTokenBalance
        );

        // Destroy the tokens
        delete balances[who];
        totalSupply_ = totalSupply_.sub(value);

        // Send the redeemer their proportion of base token held by the SafetyDepositBox
        SafetyDepositBox(SAFETY_DEPOSIT_BOX).giveTokensTo(baseToken, who, baseTokenPayout);

        TokensRedeemedForBaseTokens(who, baseTokenPayout);
        return baseTokenPayout;
    }

    // -----------------------------------
    // ---- Public Constant Functions ----
    // -----------------------------------

    /**
     * To be compliant with standards, we have a decimals function that will return the same value
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
                ShortSellRepo(
                    ShortSell(SHORT_SELL).REPO()
                ).getShortUnderlyingToken(shortId)
            ).decimals();
    }
}
