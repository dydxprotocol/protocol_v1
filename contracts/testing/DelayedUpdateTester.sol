pragma solidity 0.4.18;

import '../lib/DelayedUpdate.sol';

contract DelayedUpdateTester is DelayedUpdate {
    address public addr1;
    address public addr2;
    uint public num1;
    uint public num2;

    function DelayedUpdateTester(
        uint _updateDelay,
        uint _updateExpiration
    ) DelayedUpdate(_updateDelay, _updateExpiration) public {}

    function addr1Update(
        bytes32 id,
        address to
    )
        public
        delayedAddressUpdate(id, to)
    {
        addr1 = to;
    }

    function addr2Update(
        bytes32 id,
        address to
    )
        public
        delayedAddressUpdate(id, to)
    {
        addr2 = to;
    }

    function cancelAddrUpdate(bytes32 id) public {
        cancelAddressUpdate(id);
    }

    function num1Update(
        bytes32 id,
        uint to
    )
        public
        delayedUintUpdate(id, to)
    {
        num1 = to;
    }

    function num2Update(
        bytes32 id,
        uint to
    )
        public
        delayedUintUpdate(id, to)
    {
        num2 = to;
    }

    function cancelNumUpdate(bytes32 id) public {
        cancelUintUpdate(id);
    }
}
