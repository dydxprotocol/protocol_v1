pragma solidity 0.4.18;

import '../ShortSell.sol';
import 'zeppelin-solidity/contracts/token/StandardToken.sol';
import '../../lib/SafeMath.sol';
import '../../lib/TokenInteract.sol';


contract TokenizedShort is StandardToken, SafeMath {
    struct Short {
        address underlyingToken;
        address baseToken;
        uint shortAmount;
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
        READY,
        CLOSED
    }

    address public SHORT_SELL;
    bytes32 public shortId;
    State public state;
    uint public tokenSupply;
    string public name;
    string public symbol;
    uint8 public decimals;
    address public creator;
    uint public redeemed;

    function TokenizedShort(
        address _shortSell,
        bytes32 _shortId,
        uint _tokenSupply,
        string _name,
        string _symbol,
        uint8 _decimals
    )
        public
    {
        require(_tokenSupply > 0);

        SHORT_SELL = _shortSell;
        shortId = shortId;
        state = State.CLOSED;
        tokenSupply = _tokenSupply;
        // total supply is 0 before initialization
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
        creator = msg.sender;
    }

    function initialize() external {
        require(state == State.CLOSED);
        require(ShortSell(SHORT_SELL).getShort(shortId).seller == address(this));

        // Set to READY state
        state = State.READY;

        // Set the token supply to the desired amount
        totalSupply = tokenSupply;

        // Give the creator the entire balance
        balances[creator] = tokenSupply;
    }

    function redeem(
        uint value
    )
        external
        returns (uint _payout)
    {
        require(value <= balances[msg.sender]);

        Short memore short = getShortObject(shortId);

        // Destroy the tokens
        balances[msg.sender] = sub(balances[msg.sender], value);

        // TODO check rounding errors
        uint underlyingTokenAmount = getPartialAmount(
            value,
            tokenSupply,
            short.shortAmount
        );

        // Transfer the share of underlying token from the redeemer to this contract
        StandardToken(short.underlyingToken).transferFrom(
            msg.sender,
            address(this),
            underlyingTokenAmount
        );
    }

    function getShortObject(
        bytes32 shortId
    )
        internal
        view
        returns (Short _short)
    {
        var (
            underlyingToken,
            baseToken,
            shortAmount,
            interestRate,
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
