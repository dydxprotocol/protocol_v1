pragma solidity ^0.4.13;

import './lib/AccessControlled.sol';

contract ShortSellRepo is AccessControlled {
    uint constant ACCESS_DELAY = 1000 * 60 * 60 * 24; // 1 Day
    uint constant GRACE_PERIOD = 1000 * 60 * 60 * 8; // 8 hours

    struct Short {
        bool exists;
        address underlyingToken;
        address baseToken;
        uint interestRate;
        uint callTimeLimit;
        uint lockoutTimestamp;
        address lender;
        address seller;
        uint8 version;
    }

    mapping(bytes32 => Short) public shorts;

    function ShortSellRepo(
        address _owner
    ) AccessControlled(_owner, ACCESS_DELAY, GRACE_PERIOD) {}

    function getShort(
        bytes32 id
    ) constant public returns (
        address underlyingToken,
        address baseToken,
        uint interestRate,
        uint callTimeLimit,
        uint lockoutTimestamp,
        address lender,
        address seller,
        uint8 version
    ) {
        Short storage short = shorts[id];

        return (
            short.underlyingToken,
            short.baseToken,
            short.interestRate,
            short.callTimeLimit,
            short.lockoutTimestamp,
            short.lender,
            short.seller,
            short.version
        );
    }

    function containsShort(
        bytes32 id
    ) constant public returns (
        bool exists
    ) {
        return shorts[id].exists;
    }

    function setShort(
        bytes32 id,
        address underlyingToken,
        address baseToken,
        uint interestRate,
        uint callTimeLimit,
        uint lockoutTimestamp,
        address lender,
        address seller,
        uint8 version
    ) requiresAuthorization {
        shorts[id] = Short({
            exists: true,
            underlyingToken: underlyingToken,
            baseToken: baseToken,
            interestRate: interestRate,
            callTimeLimit: callTimeLimit,
            lockoutTimestamp: lockoutTimestamp,
            lender: lender,
            seller: seller,
            version: version
        });
    }

    function deleteShort(
        bytes32 id
    ) requiresAuthorization {
        delete shorts[id];
    }
}
