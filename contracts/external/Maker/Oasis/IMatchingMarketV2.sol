pragma solidity 0.4.24;
pragma experimental "v0.5.0";

import { ISimpleMarketV1 } from "./ISimpleMarketV1.sol";


contract IMatchingMarketV2 is ISimpleMarketV1 {

    // ============ Structs ================

    struct sortInfo {
        uint256 next;  //points to id of next higher offer
        uint256 prev;  //points to id of previous lower offer
        uint256 delb;  //the blocknumber where this entry was marked for delete
    }

    // ============ Storage ================

    uint64 public close_time;

    bool public stopped;

    bool public buyEnabled;

    bool public matchingEnabled;

    mapping(uint256 => sortInfo) public _rank;

    mapping(address => mapping(address => uint)) public _best;

    mapping(address => mapping(address => uint)) public _span;

    mapping(address => uint) public _dust;

    mapping(uint256 => uint) public _near;

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
        uint256 pay_amt,
        address pay_gem,
        uint256 buy_amt,
        address buy_gem
    )
        public
        returns (uint);

    function offer(
        uint256 pay_amt,
        address pay_gem,
        uint256 buy_amt,
        address buy_gem,
        uint256 pos
    )
        public
        returns (uint);

    function offer(
        uint256 pay_amt,
        address pay_gem,
        uint256 buy_amt,
        address buy_gem,
        uint256 pos,
        bool rounding
    )
        public
        returns (uint);

    function buy(
        uint256 id,
        uint256 amount
    )
        public
        returns (bool);

    function cancel(
        uint256 id
    )
        public
        returns (bool success);

    function insert(
        uint256 id,
        uint256 pos
    )
        public
        returns (bool);

    function del_rank(
        uint256 id
    )
        public
        returns (bool);

    function sellAllAmount(
        address pay_gem,
        uint256 pay_amt,
        address buy_gem,
        uint256 min_fill_amount
    )
        public
        returns (uint256 fill_amt);

    function buyAllAmount(
        address buy_gem,
        uint256 buy_amt,
        address pay_gem,
        uint256 max_fill_amount
    )
        public
        returns (uint256 fill_amt);

    // ============ Constant Functions ================

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
        uint256 id
    )
        public
        view
        returns(uint);

    function getBetterOffer(
        uint256 id
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
        uint256 id
    )
        public
        view
        returns(uint);

    function isOfferSorted(
        uint256 id
    )
        public
        view
        returns(bool);

    function getBuyAmount(
        address buy_gem,
        address pay_gem,
        uint256 pay_amt
    )
        public
        view
        returns (uint256 fill_amt);

    function getPayAmount(
        address pay_gem,
        address buy_gem,
        uint256 buy_amt
    )
        public
        view
        returns (uint256 fill_amt);

    function isClosed()
        public
        view
        returns (bool closed);

    function getTime()
        public
        view
        returns (uint64);
}
