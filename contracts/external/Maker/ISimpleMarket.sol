pragma solidity 0.4.24;
pragma experimental "v0.5.0";


contract ISimpleMarket {

    // ============ Structs ================

    struct OfferInfo {
        uint     pay_amt;
        address  pay_gem;
        uint     buy_amt;
        address  buy_gem;
        address  owner;
        uint64   timestamp;
    }

    // ============ Storage ================

    uint public last_offer_id;

    mapping (uint => OfferInfo) public offers;

    // ============ Functions ================

    function isActive(
        uint id
    )
        public
        view
        returns (bool active );

    function getOwner(
        uint id
    )
        public
        view
        returns (address owner);

    function getOffer(
        uint id
    )
        public
        view
        returns (uint, address, uint, address);

    function bump(
        bytes32 id_
    )
        public;

    function buy(
        uint id,
        uint quantity
    )
        public
        returns (bool);

    function cancel(
        uint id
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
        uint pay_amt,
        address pay_gem,
        uint buy_amt,
        address buy_gem
    )
        public
        returns (uint id);

    function take(
        bytes32 id,
        uint128 maxTakeAmount
    )
        public;
}
