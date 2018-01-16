pragma solidity 0.4.18;

import { ReentrancyGuard } from "zeppelin-solidity/contracts/ReentrancyGuard.sol";
import { StandardToken } from "zeppelin-solidity/contracts/token/StandardToken.sol";
import { DetailedERC20 } from "zeppelin-solidity/contracts/token/DetailedERC20.sol";
import { ShortSell } from "../ShortSell.sol";
import { SafeMath } from "../../lib/SafeMath.sol";
import { TokenInteract } from "../../lib/TokenInteract.sol";


contract TokenizedShort is StandardToken, SafeMath, ReentrancyGuard {
    struct Short {
        address underlyingToken;
        address baseToken;
        uint shortAmount;
        uint closedAmount;
        uint interestRate;
        uint32 callTimeLimit;
        uint32 lockoutTime;
        uint32 startTimestamp;
        uint32 callTimestamp;
        address lender;
        address seller;
    }

    enum State {
        UNINITIALIZED,
        OPEN,
        CLOSED
    }

    event TokensRedeemed(
        address indexed redeemer,
        uint value,
        uint payout
    );

    address public SHORT_SELL;
    bytes32 public shortId;
    State public state;
    string public name;
    string public symbol;
    address public creator;
    uint public redeemed;

    modifier onlyWhileUninitialized {
        require(state == State.UNINITIALIZED);
        _;
    }

    modifier onlyWhileOpen {
        require(state == State.OPEN);
        _;
    }

    function TokenizedShort(
        address _shortSell,
        bytes32 _shortId,
        string _name,
        string _symbol
    )
        public
    {
        SHORT_SELL = _shortSell;
        shortId = _shortId;
        state = State.UNINITIALIZED;
        // total supply is 0 before initialization
        name = _name;
        symbol = _symbol;
        creator = msg.sender;
    }

    function initialize()
        onlyWhileUninitialized
        nonReentrant
        external
    {
        Short memory short = getShortObject();
        require(short.seller == address(this));

        // Set to OPEN state
        state = State.OPEN;

        uint currentShortAmount = sub(short.shortAmount, short.closedAmount);

        require(currentShortAmount > 0);

        // Give the creator the entire balance, which is equal to the current amount of the short
        balances[creator] = currentShortAmount;

        totalSupply = currentShortAmount;
    }

    function redeemDirectly(
        uint value
    )
        onlyWhileOpen
        nonReentrant
        external
        returns (uint _payout)
    {
        require(value <= balances[msg.sender]);
        require(value > 0);

        // Destroy the tokens
        balances[msg.sender] = sub(balances[msg.sender], value);
        totalSupply = sub(totalSupply, value);

        // Increment redeemed counter
        redeemed = add(redeemed, value);

        Short memory short = getShortObject();

        uint currentShortAmount = sub(short.shortAmount, short.closedAmount);

        // This should always be true
        assert(currentShortAmount >= value);

        // If we are closing the rest of the short, set this contract's state to CLOSED
        if (currentShortAmount == value) {
            state = State.CLOSED;
        }

        // Transfer the share of underlying token from the redeemer to this contract
        require(
            StandardToken(short.underlyingToken).transferFrom(
                msg.sender,
                address(this),
                value
            )
        );

        // Close this part of the short using the underlying token
        var (baseTokenPayout, ) = ShortSell(SHORT_SELL).closeShortDirectly(
            shortId,
            value
        );

        // Send the token holder the received amount of base token
        require(
            StandardToken(short.baseToken).transfer(
                msg.sender,
                baseTokenPayout
            )
        );

        TokensRedeemed(
            msg.sender,
            value,
            baseTokenPayout
        );

        return baseTokenPayout;
    }

    // The decimals are equal to the underlying token decimals
    function decimals() view public returns (
        uint8 _decimals
    ) {
        Short memory short = getShortObject();
        return DetailedERC20(short.underlyingToken).decimals();
    }

    function getShortObject()
        internal
        view
        returns (Short _short)
    {
        var (
            underlyingToken,
            baseToken,
            shortAmount,
            interestRate,
            closedAmount,
            callTimeLimit,
            lockoutTime,
            startTimestamp,
            callTimestamp,
            lender,
            seller
        ) =  ShortSell(SHORT_SELL).getShort(shortId);

        // This checks that the short exists
        require(startTimestamp != 0);

        return Short({
            underlyingToken: underlyingToken,
            baseToken: baseToken,
            shortAmount: shortAmount,
            closedAmount: closedAmount,
            interestRate: interestRate,
            callTimeLimit: callTimeLimit,
            lockoutTime: lockoutTime,
            startTimestamp: startTimestamp,
            callTimestamp: callTimestamp,
            lender: lender,
            seller: seller
        });
    }
}
