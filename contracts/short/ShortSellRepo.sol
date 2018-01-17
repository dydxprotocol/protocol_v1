pragma solidity 0.4.18;

import { NoOwner } from "zeppelin-solidity/contracts/ownership/NoOwner.sol";
import { AccessControlled } from "../lib/AccessControlled.sol";


/**
 * @title ShortSellRepo
 * @author Antonio Juliano
 *
 * This contract is used to store state for short sells
 */
contract ShortSellRepo is AccessControlled, NoOwner {
    // -----------------------
    // ------- Structs -------
    // -----------------------

    struct Short {
        uint shortAmount;
        uint closedAmount;
        uint interestRate;
        address underlyingToken;    // Immutable
        address baseToken;          // Immutable
        address lender;
        address seller;
        uint32 startTimestamp;      // Immutable, Cannot be 0
        uint32 callTimestamp;
        uint32 callTimeLimit;
        uint32 lockoutTime;
    }

    // ---------------------------
    // ----- State Variables -----
    // ---------------------------

    // Mapping that contains all short sells. Mapped by: shortId -> Short
    mapping(bytes32 => Short) public shorts;
    mapping(bytes32 => bool) public closedShorts;

    // -------------------------
    // ------ Constructor ------
    // -------------------------

    function ShortSellRepo(
        uint _accessDelay,
        uint _gracePeriod
    )
        public
        AccessControlled(_accessDelay, _gracePeriod)
    {}

    // --------------------------------------------------
    // ---- Authorized Only State Changing Functions ----
    // --------------------------------------------------

    function addShort(
        bytes32 id,
        address underlyingToken,
        address baseToken,
        uint shortAmount,
        uint interestRate,
        uint32 callTimeLimit,
        uint32 lockoutTime,
        uint32 startTimestamp,
        address lender,
        address seller
    )
        requiresAuthorization
        external
    {
        require(!containsShort(id));
        require(startTimestamp != 0);

        shorts[id] = Short({
            underlyingToken: underlyingToken,
            baseToken: baseToken,
            shortAmount: shortAmount,
            closedAmount: 0,
            interestRate: interestRate,
            callTimeLimit: callTimeLimit,
            lockoutTime: lockoutTime,
            startTimestamp: startTimestamp,
            callTimestamp: 0,
            lender: lender,
            seller: seller
        });
    }

    function setShortCallStart(
        bytes32 id,
        uint32 callStart
    )
        requiresAuthorization
        external
    {
        require(containsShort(id));
        shorts[id].callTimestamp = callStart;
    }

    function setShortLender(
        bytes32 id,
        address who
    )
        requiresAuthorization
        external
    {
        require(containsShort(id));
        shorts[id].lender = who;
    }

    function setShortSeller(
        bytes32 id,
        address who
    )
        requiresAuthorization
        external
    {
        require(containsShort(id));
        shorts[id].seller = who;
    }

    function setShortClosedAmount(
        bytes32 id,
        uint closedAmount
    )
        requiresAuthorization
        external
    {
        require(containsShort(id));
        shorts[id].closedAmount = closedAmount;
    }

    /**
     * NOTE: Currently unused, added as a utility for later versions of ShortSell
     */
    function setShortAmount(
        bytes32 id,
        uint amount
    )
        requiresAuthorization
        external
    {
        require(containsShort(id));
        shorts[id].shortAmount = amount;
    }

    /**
     * NOTE: Currently unused, added as a utility for later versions of ShortSell
     */
    function setShortInterestRate(
        bytes32 id,
        uint rate
    )
        requiresAuthorization
        external
    {
        require(containsShort(id));
        shorts[id].interestRate = rate;
    }

    /**
     * NOTE: Currently unused, added as a utility for later versions of ShortSell
     */
    function setShortCallTimeLimit(
        bytes32 id,
        uint32 limit
    )
        requiresAuthorization
        external
    {
        require(containsShort(id));
        shorts[id].callTimeLimit = limit;
    }

    /**
     * NOTE: Currently unused, added as a utility for later versions of ShortSell
     */
    function setShortLockoutTime(
        bytes32 id,
        uint32 time
    )
        requiresAuthorization
        external
    {
        require(containsShort(id));
        shorts[id].lockoutTime = time;
    }

    function deleteShort(
        bytes32 id
    )
        requiresAuthorization
        external
    {
        delete shorts[id];
    }

    function markShortClosed(
        bytes32 id
    )
        requiresAuthorization
        external
    {
        closedShorts[id] = true;
    }

    /**
     * NOTE: Currently unused, added as a utility for later versions of ShortSell
     */
    function unmarkShortClosed(
        bytes32 id
    )
        requiresAuthorization
        external
    {
        closedShorts[id] = false;
    }

    // -------------------------------------
    // ----- Public Constant Functions -----
    // -------------------------------------

    function getShort(
        bytes32 id
    )
        view
        public
        returns (
            address underlyingToken,
            address baseToken,
            uint shortAmount,
            uint closedAmount,
            uint interestRate,
            uint32 callTimeLimit,
            uint32 lockoutTime,
            uint32 startTimestamp,
            uint32 callTimestamp,
            address lender,
            address seller
        )
    {
        Short storage short = shorts[id];

        return (
            short.underlyingToken,
            short.baseToken,
            short.shortAmount,
            short.closedAmount,
            short.interestRate,
            short.callTimeLimit,
            short.lockoutTime,
            short.startTimestamp,
            short.callTimestamp,
            short.lender,
            short.seller
        );
    }

    function containsShort(
        bytes32 id
    )
        view
        public
        returns (bool exists)
    {
        return shorts[id].startTimestamp != 0;
    }
}
