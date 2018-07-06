pragma solidity 0.4.24;
pragma experimental "v0.5.0";

import { ERC20 } from "./ERC20.sol";


contract SimpleMarketInterface {

    // ============ Structs ================

    struct OfferInfo {
        uint     pay_amt;
        ERC20    pay_gem;
        uint     buy_amt;
        ERC20    buy_gem;
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
        constant
        returns (bool active );

    function getOwner(
        uint id
    )
        public
        constant
        returns (address owner);

    function getOffer(
        uint id
    )
        public
        constant
        returns (uint, ERC20, uint, ERC20);

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
        bytes32 id) public;

    function make(
        ERC20    pay_gem,
        ERC20    buy_gem,
        uint128  pay_amt,
        uint128  buy_amt
    )
        public
        returns (bytes32 id);


    function offer(
        uint pay_amt,
        ERC20 pay_gem,
        uint buy_amt,
        ERC20 buy_gem
    )
        public
        returns (uint id);

    function take(
        bytes32 id,
        uint128 maxTakeAmount
    )
        public;
}
