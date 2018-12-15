pragma solidity 0.4.24;
pragma experimental "v0.5.0";


contract ISimpleMarketV1 {

    // ============ Structs ================

    struct OfferInfo {
        uint256 pay_amt;
        address pay_gem;
        uint256 buy_amt;
        address buy_gem;
        address owner;
        uint64 timestamp;
    }

    // ============ Storage ================

    uint256 public last_offer_id;

    mapping (uint256 => OfferInfo) public offers;

    // ============ Functions ================

    function isActive(
        uint256 id
    )
        public
        view
        returns (bool active );

    function getOwner(
        uint256 id
    )
        public
        view
        returns (address owner);

    function getOffer(
        uint256 id
    )
        public
        view
        returns (uint, address, uint, address);

    function bump(
        bytes32 id_
    )
        public;

    function buy(
        uint256 id,
        uint256 quantity
    )
        public
        returns (bool);

    function cancel(
        uint256 id
    )
        public
        returns (bool success);

    function kill(
        bytes32 id
    )
        public;

    function make(
        address  pay_gem,
        address  buy_gem,
        uint128  pay_amt,
        uint128  buy_amt
    )
        public
        returns (bytes32 id);


    function offer(
        uint256 pay_amt,
        address pay_gem,
        uint256 buy_amt,
        address buy_gem
    )
        public
        returns (uint256 id);

    function take(
        bytes32 id,
        uint128 maxTakeAmount
    )
        public;
}
