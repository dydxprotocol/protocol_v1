pragma solidity 0.4.19;

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
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


contract TokenizedShort is StandardToken, CloseShortVerifier, ReentrancyGuard {
    using SafeMath for uint;

    enum State {
        UNINITIALIZED,
        OPEN,
        CLOSED
    }

    // ------------------------
    // -------- Events --------
    // ------------------------

    // Emitted when tokens are burned either by closing the short or withdrawing base tokens after
    // the short has been closed.
    event TokensRedeemed(
        address indexed redeemer,
        uint256 value
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
        state = State.UNINITIALIZED;
        shortId = _shortId;
        name = _name;
        symbol = _symbol;
        initialTokenHolder = _initialTokenHolder;
    }

    // -----------------------------------------
    // ---- Public State Changing Functions ----
    // -----------------------------------------

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
     * position.
     * @param  _who      The address of the owner
     * @param  _shortId  The unique id of the short position
     * @param  _amount   The amount of the position being closed
     */
    function closeOnBehalfOf(
        address _who,
        bytes32 _shortId,
        uint256 _amount
    )
        nonReentrant
        external
        returns (bool _success)
    {
        require(state == State.OPEN);
        require(msg.sender == SHORT_SELL);
        require(_shortId == shortId);
        require(balances[_who] >= _amount);

        /**
         * Additional checks can be placed here. Some simple examples are:
         *
         * require(block.timestamp >= lockoutTime);
         * require(amount >= minimumDenomination);
         */

        balances[_who] = balances[_who].sub(_amount);
        totalSupply_ = totalSupply_.sub(_amount);

        TokensRedeemed(_who, _amount);
        return true;
    }

    /**
     * TODO: Should we allow withdrawing for others? It is possible that withdrawing later is the
     * most advantageous due to rounding error. An "attack" could involve withdrawing for others before
     * withdrawing for yourself.
     *
     * NOTE: It is possible that this contract could be sent base token by external sources
     * other than from the ShortSell contract. In this case the payout for token holders
     * would be greater than just that from the short sell payout. This is fine because
     * nobody has incentive to send this contract extra funds, and if they do then it's
     * also fine just to let the token holders have it.
     *
     * @return        The number of base tokens withdrawn
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
            address vault = ShortSell(SHORT_SELL).VAULT();
            address safetyDepositBox = Vault(vault).SAFETY_DEPOSIT_BOX();
            SafetyDepositBox(safetyDepositBox).withdraw(baseToken, address(this));
            state = State.CLOSED;
        }
        require(state == State.CLOSED);

        uint256 baseTokenBalance = StandardToken(baseToken).balanceOf(address(this));
        // NOTE the payout must be calculated before decrementing the totalSupply below
        uint256 baseTokenPayout = MathHelpers.getPartialAmount(
            value,
            totalSupply_,
            baseTokenBalance
        );

        // Destroy the tokens
        delete balances[who];
        totalSupply_ = totalSupply_.sub(value);

        // Send the redeemer their proportion of base token held by this contract
        require(StandardToken(baseToken).transfer(who,baseTokenPayout));

        TokensRedeemed(who, value);
        return baseTokenPayout;
    }
}
