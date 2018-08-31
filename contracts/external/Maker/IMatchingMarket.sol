pragma solidity 0.4.24;
pragma experimental "v0.5.0";

import { ISimpleMarket } from "./ISimpleMarket.sol";


contract IMatchingMarket is ISimpleMarket {

    // ============ Structs ================

    struct sortInfo {
        uint next;  //points to id of next higher offer
        uint prev;  //points to id of previous lower offer
        uint delb;  //the blocknumber where this entry was marked for delete
    }

    // ============ Storage ================

    uint64 public close_time;

    bool public stopped;

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
        address  pay_gem,
        address  buy_gem,
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
        address pay_gem,
        uint buy_amt,
        address buy_gem
    )
        public
        returns (uint);

    function offer(
        uint pay_amt,
        address pay_gem,
        uint buy_amt,
        address buy_gem,
        uint pos
    )
        public
        returns (uint);

    function offer(
        uint pay_amt,
        address pay_gem,
        uint buy_amt,
        address buy_gem,
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

    function sellAllAmount(
        address pay_gem,
        uint pay_amt,
        address buy_gem,
        uint min_fill_amount
    )
        public
        returns (uint fill_amt);

    function buyAllAmount(
        address buy_gem,
        uint buy_amt,
        address pay_gem,
        uint max_fill_amount
    )
        public
        returns (uint fill_amt);

    // ============ Constant Functions ================

    function isTokenPairWhitelisted(
        address baseToken,
        address quoteToken
    )
        public
        view
        returns (bool);

    function getMinSell(
        address pay_gem
    )
        public
        view
        returns (uint);

    function getBestOffer(
        address sell_gem,
        address buy_gem
    )
        public
        view
        returns(uint);

    function getWorseOffer(
        uint id
    )
        public
        view
        returns(uint);

    function getBetterOffer(
        uint id
    )
        public
        view
        returns(uint);

    function getOfferCount(
        address sell_gem,
        address buy_gem
    )
        public
        view
        returns(uint);

    function getFirstUnsortedOffer()
        public
        view
        returns(uint);

    function getNextUnsortedOffer(
        uint id
    )
        public
        view
        returns(uint);

    function isOfferSorted(
        uint id
    )
        public
        view
        returns(bool);

    function getBuyAmount(
        address buy_gem,
        address pay_gem,
        uint pay_amt
    )
        public
        view
        returns (uint fill_amt);

    function getPayAmount(
        address pay_gem,
        address buy_gem,
        uint buy_amt
    )
        public
        view
        returns (uint fill_amt);

    function isClosed()
        public
        view
        returns (bool closed);

    function getTime()
        public
        view
        returns (uint64);
}
