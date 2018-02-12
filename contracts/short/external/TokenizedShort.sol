pragma solidity 0.4.19;

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { ReentrancyGuard } from "zeppelin-solidity/contracts/ReentrancyGuard.sol";
import { StandardToken } from "zeppelin-solidity/contracts/token/ERC20/StandardToken.sol";
import { DetailedERC20 } from "zeppelin-solidity/contracts/token/ERC20/DetailedERC20.sol";
import { ShortSell } from "../ShortSell.sol";
import { ShortSellCommon } from "../impl/ShortSellCommon.sol";
import { ShortSellState } from "../impl/ShortSellState.sol";
import { TokenInteract } from "../../lib/TokenInteract.sol";
import { Proxy } from "../../shared/Proxy.sol";
import { MathHelpers } from "../../lib/MathHelpers.sol";


contract TokenizedShort is StandardToken, ReentrancyGuard {
    using SafeMath for uint;

    enum State {
        UNINITIALIZED,
        OPEN,
        CLOSED
    }

    // ------------------------
    // -------- Events --------
    // ------------------------

    event TokensRedeemed(
        address indexed redeemer,
        uint value,
        uint payout
    );

    // ---------------------------
    // ----- State Variables -----
    // ---------------------------

    // Address of the ShortSell contract
    address public SHORT_SELL;

    // Address of the Proxy contract
    address public PROXY;

    // Address of the Repo contract
    address public REPO;

    // id of the short this contract is tokenizing
    bytes32 public shortId;

    // Current State of this contract. See State enum
    State public state;

    // Name of this token (as ERC20 standard)
    string public name;

    // Symbol of this token (as ERC20 standard)
    string public symbol;

    // Once intialized, all tokens will initially be allocated to this address
    address public initialTokenHolder;

    // Amount of tokens that have been redeemed
    uint public redeemed;

    address public baseToken;

    // -------------------------
    // ------- Modifiers -------
    // -------------------------

    modifier onlyWhileUninitialized {
        require(state == State.UNINITIALIZED);
        _;
    }

    modifier onlyWhileOpen {
        require(state == State.OPEN);
        _;
    }

    // -------------------------
    // ------ Constructor ------
    // -------------------------

    function TokenizedShort(
        address _shortSell,
        address _proxy,
        address _repo,
        address _initialTokenHolder,
        bytes32 _shortId,
        string _name,
        string _symbol
    )
        public
    {
        SHORT_SELL = _shortSell;
        PROXY = _proxy;
        REPO = _repo;
        shortId = _shortId;
        state = State.UNINITIALIZED;
        // total supply is 0 before initialization
        name = _name;
        symbol = _symbol;
        initialTokenHolder = _initialTokenHolder;
    }

    // -----------------------------------------
    // ---- Public State Changing Functions ----
    // -----------------------------------------

    function initialize()
        onlyWhileUninitialized
        nonReentrant
        external
    {
        ShortSellCommon.Short memory short =
            ShortSellCommon.getShortObject(REPO, shortId);

        // The ownership of the short must be transferred to this contract before intialization
        // Once ownership is transferred, there is no way to have this contract transfer it back
        // to the original short seller. Therefore, the short seller transferring ownership should
        // verify that the initialTokenHolder field is properly set so that they recieve the tokens.
        require(short.seller == address(this));

        state = State.OPEN;

        uint currentShortAmount = short.shortAmount.sub(short.closedAmount);

        require(currentShortAmount > 0);

        // Give the specified address the entire balance, equal to the current amount of the short
        balances[initialTokenHolder] = currentShortAmount;

        totalSupply_ = currentShortAmount;

        baseToken = short.baseToken;
    }

    function redeemDirectly(
        uint value
    )
        onlyWhileOpen
        nonReentrant
        external
        returns (uint _payout)
    {
        ShortSellCommon.Short memory short = validateAndUpdateStateForRedeem(value);

        // Transfer the share of underlying token from the redeemer to this contract
        Proxy(PROXY).transfer(
            short.underlyingToken,
            msg.sender,
            value
        );

        // Close this part of the short using the underlying token
        var (baseTokenPayout, ) = ShortSell(SHORT_SELL).closeShortDirectly(
            shortId,
            value
        );

        // Send the token holder the received amount of base token
        sendPayoutAndLogEventForRedeem(
            value,
            baseTokenPayout
        );

        return baseTokenPayout;
    }

    function redeem(
        uint value,
        address[5] orderAddresses,
        uint[6] orderValues,
        uint8 orderV,
        bytes32 orderR,
        bytes32 orderS
    )
        onlyWhileOpen
        nonReentrant
        external
        returns (uint _payout)
    {
        ShortSellCommon.Short memory short = validateAndUpdateStateForRedeem(value);

        // Transfer the taker fee for the order from the redeemer
        address takerFeeToken = orderAddresses[4];

        transferTakerFeeForRedeem(
            short,
            value,
            takerFeeToken,
            orderValues
        );

        // Close this part of the short using the underlying token
        var (baseTokenPayout, ) = ShortSell(SHORT_SELL).closeShort(
            shortId,
            value,
            orderAddresses,
            orderValues,
            orderV,
            orderR,
            orderS
        );

        // Send the token holder the received amount of base token
        sendPayoutAndLogEventForRedeem(
            value,
            baseTokenPayout
        );

        return baseTokenPayout;
    }

    function claimPayout()
        nonReentrant
        external
        returns (uint _payout)
    {
        uint value = balances[msg.sender];

        // If in OPEN state, but the short is closed, set to CLOSED state
        if (state == State.OPEN && ShortSell(SHORT_SELL).isShortClosed(shortId)) {
            state = State.CLOSED;
        }

        require(state == State.CLOSED);
        require(value > 0);

        uint baseTokenBalance = StandardToken(baseToken).balanceOf(address(this));
        // NOTE the payout must be calculated before decrementing the totalSupply below
        uint baseTokenPayout = MathHelpers.getPartialAmount(
            value,
            totalSupply_,
            baseTokenBalance
        );

        // Destroy the tokens
        balances[msg.sender] = 0;
        totalSupply_ = totalSupply_.sub(value);

        // Increment redeemed counter
        redeemed = redeemed.add(value);

        // Send the redeemer their proportion of base token held by this contract
        // NOTE: It is possible that this contract could be sent base token by external sources
        //       other than from the ShortSell contract. In this case the payout for token holders
        //       would be greater than just that from the short sell payout. This is fine because
        //       nobody has incentive to send this contract extra funds, and if they do then it's
        //       also fine just to let the token holders have it
        sendPayoutAndLogEventForRedeem(
            value,
            baseTokenPayout
        );

        return baseTokenPayout;
    }

    // -------------------------------------
    // ----- Public Constant Functions -----
    // -------------------------------------

    // The decimals are equal to the underlying token decimals
    function decimals()
        view
        public
        returns (uint8 _decimals)
    {
        ShortSellCommon.Short memory short =
            ShortSellCommon.getShortObject(REPO, shortId);
        return DetailedERC20(short.underlyingToken).decimals();
    }

    // --------------------------------
    // ------ Internal Functions ------
    // --------------------------------

    function validateAndUpdateStateForRedeem(
        uint value
    )
        internal
        returns (ShortSellCommon.Short _short)
    {
        require(value <= balances[msg.sender]);
        require(value > 0);

        // Destroy the tokens
        balances[msg.sender] = balances[msg.sender].sub(value);
        totalSupply_ = totalSupply_.sub(value);

        // Increment redeemed counter
        redeemed = redeemed.add(value);

        ShortSellCommon.Short memory short =
            ShortSellCommon.getShortObject(REPO, shortId);

        uint currentShortAmount = short.shortAmount.sub(short.closedAmount);

        // This should always be true
        assert(currentShortAmount >= value);

        // If we are closing the rest of the short, set this contract's state to CLOSED
        if (currentShortAmount == value) {
            assert(totalSupply_ == 0);
            state = State.CLOSED;
        }

        return short;
    }

    function sendPayoutAndLogEventForRedeem(
        uint value,
        uint baseTokenPayout
    )
        internal
    {
        require(
            StandardToken(baseToken).transfer(
                msg.sender,
                baseTokenPayout
            )
        );

        TokensRedeemed(
            msg.sender,
            value,
            baseTokenPayout
        );
    }

    function transferTakerFeeForRedeem(
        ShortSellCommon.Short short,
        uint value,
        address takerFeeToken,
        uint[6] orderValues
    )
        internal
    {
        // If the taker fee is to be paid in base token, then the short sell contract will
        // automatically use funds it has locked in Vault to pay the fee. Otherwise it
        // needs to be transfered in
        if (takerFeeToken != short.baseToken) {
            uint baseTokenPrice = MathHelpers.getPartialAmount(
                orderValues[1],
                orderValues[0],
                value
            );

            // takerFee = buyOrderTakerFee * (baseTokenPrice / buyOrderBaseTokenAmount)
            uint takerFee = MathHelpers.getPartialAmount(
                baseTokenPrice,
                orderValues[1],
                orderValues[3]
            );

            Proxy(PROXY).transfer(
                takerFeeToken,
                msg.sender,
                takerFee
            );
        }
    }
}
