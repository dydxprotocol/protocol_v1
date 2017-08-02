pragma solidity ^0.4.13;

import './lib/AccessControlled.sol';

contract ShortSellRepo is AccessControlled {
    uint constant ACCESS_DELAY = 1 days; // 1 Day
    uint constant GRACE_PERIOD = 8 hours; // 8 hours

    struct Short {
        bool exists;
        address underlyingToken;
        address baseToken;
        uint shortAmount;
        uint interestRate;
        uint callTimeLimit;
        uint lockoutTime;
        uint startTimestamp;
        uint callTimestamp;
        address lender;
        address seller;
        uint8 version;
    }

    mapping(bytes32 => Short) public shorts;

    function ShortSellRepo(
    ) AccessControlled(ACCESS_DELAY, GRACE_PERIOD) {}

    function getShort(
        bytes32 id
    ) constant public returns (
        address underlyingToken,
        address baseToken,
        uint shortAmount,
        uint interestRate,
        uint callTimeLimit,
        uint lockoutTime,
        uint startTimestamp,
        uint callTimestamp,
        address lender,
        address seller,
        uint8 version
    ) {
        Short storage short = shorts[id];

        return (
            short.underlyingToken,
            short.baseToken,
            short.shortAmount,
            short.interestRate,
            short.callTimeLimit,
            short.lockoutTime,
            short.startTimestamp,
            short.callTimestamp,
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

    function addShort(
        bytes32 id,
        address underlyingToken,
        address baseToken,
        uint shortAmount,
        uint interestRate,
        uint callTimeLimit,
        uint lockoutTime,
        uint startTimestamp,
        address lender,
        address seller,
        uint8 version
    ) requiresAuthorization {
        require(!containsShort(id));

        shorts[id] = Short({
            exists: true,
            underlyingToken: underlyingToken,
            baseToken: baseToken,
            shortAmount: shortAmount,
            interestRate: interestRate,
            callTimeLimit: callTimeLimit,
            lockoutTime: lockoutTime,
            startTimestamp: startTimestamp,
            callTimestamp: 0, // Not set until later
            lender: lender,
            seller: seller,
            version: version
        });
    }

    function setShortCallStart(
        bytes32 id,
        uint callStart
    ) requiresAuthorization {
        require(containsShort(id));
        shorts[id].callTimestamp = callStart;
    }

    function deleteShort(
        bytes32 id
    ) requiresAuthorization {
        delete shorts[id];
    }
}
