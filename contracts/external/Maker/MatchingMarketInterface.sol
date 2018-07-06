pragma solidity 0.4.24;
pragma experimental "v0.5.0";

import { ERC20 } from "./ERC20.sol";
import { ExpiringMarketInterface } from "./ExpiringMarketInterface.sol";


contract MatchingMarketInterface is ExpiringMarketInterface {

    // ============ Structs ================

    struct sortInfo {
        uint next;  //points to id of next higher offer
        uint prev;  //points to id of previous lower offer
        uint delb;  //the blocknumber where this entry was marked for delete
    }

    // ============ Storage ================

    bool public buyEnabled;

    bool public matchingEnabled;

    mapping(uint => sortInfo) public _rank;

    mapping(address => mapping(address => uint)) public _best;

    mapping(address => mapping(address => uint)) public _span;

    mapping(address => uint) public _dust;

    mapping(uint => uint) public _near;

    mapping(bytes32 => bool) public _menu;

    // ============ Functions ================

    function make(
        ERC20    pay_gem,
        ERC20    buy_gem,
        uint128  pay_amt,
        uint128  buy_amt
    )
        public
        returns (bytes32);

    function take(
        bytes32 id,
        uint128 maxTakeAmount
    )
        public;

    function kill(
        bytes32 id
    )
        public;

    function offer(
        uint pay_amt,
        ERC20 pay_gem,
        uint buy_amt,
        ERC20 buy_gem
    )
        public
        returns (uint);

    function offer(
        uint pay_amt,
        ERC20 pay_gem,
        uint buy_amt,
        ERC20 buy_gem,
        uint pos
    )
        public
        returns (uint);

    function offer(
        uint pay_amt,
        ERC20 pay_gem,
        uint buy_amt,
        ERC20 buy_gem,
        uint pos,
        bool rounding
    )
        public
        returns (uint);

    function buy(
        uint id,
        uint amount
    )
        public
        returns (bool);

    function cancel(
        uint id
    )
        public
        returns (bool success);

    function insert(
        uint id,
        uint pos
    )
        public
        returns (bool);

    function del_rank(
        uint id
    )
        public
        returns (bool);

    function isTokenPairWhitelisted(
        ERC20 baseToken,
        ERC20 quoteToken
    )
        public
        constant
        returns (bool);

    function getMinSell(
        ERC20 pay_gem
    )
        public
        constant
        returns (uint);

    function getBestOffer(
        ERC20 sell_gem,
        ERC20 buy_gem
    )
        public
        constant
        returns(uint);

    function getWorseOffer(
        uint id
    )
        public
        constant
        returns(uint);

    function getBetterOffer(
        uint id
    )
        public
        constant
        returns(uint);

    function getOfferCount(
        ERC20 sell_gem,
        ERC20 buy_gem
    )
        public
        constant
        returns(uint);

    function getFirstUnsortedOffer()
        public
        constant
        returns(uint);

    function getNextUnsortedOffer(uint id)
        public
        constant
        returns(uint);

    function isOfferSorted(uint id)
        public
        constant
        returns(bool);

    function sellAllAmount(
        ERC20 pay_gem,
        uint pay_amt,
        ERC20 buy_gem,
        uint min_fill_amount
    )
        public
        returns (uint fill_amt);

    function buyAllAmount(
        ERC20 buy_gem,
        uint buy_amt,
        ERC20 pay_gem,
        uint max_fill_amount
    )
        public
        returns (uint fill_amt);

    function getBuyAmount(
        ERC20 buy_gem,
        ERC20 pay_gem,
        uint pay_amt
    )
        public
        constant
        returns (uint fill_amt);

    function getPayAmount(
        ERC20 pay_gem,
        ERC20 buy_gem,
        uint buy_amt
    )
        public
        constant
        returns (uint fill_amt);
}
