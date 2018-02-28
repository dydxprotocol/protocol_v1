pragma solidity 0.4.19;

import { ShortSellCommon } from './ShortSellCommon.sol';
import { ShortSellState } from './ShortSellState.sol';


contract ShortSellGetters {
    // ---------------------------
    // ----- State Variables -----
    // ---------------------------

    /**
     * Struct holding the entire state of ShortSell
     */
    ShortSellState.State state;

    // -------------------------------------
    // ----- Public Constant Functions -----
    // -------------------------------------

    /**
     * Get a Short by id. This does not validate the short exists. If the short does not exist
     * all 0's will be returned.
     */
    function getShort(
        bytes32 id
    )
        view
        external
        returns (
            address underlyingToken,
            address baseToken,
            uint shortAmount,
            uint closedAmount,
            uint interestRate,
            uint32 callTimeLimit,
            uint32 startTimestamp,
            uint32 callTimestamp,
            uint32 maxDuration,
            address lender,
            address seller
        )
    {
        ShortSellCommon.Short storage short = state.shorts[id];

        return (
            short.underlyingToken,
            short.baseToken,
            short.shortAmount,
            short.closedAmount,
            short.interestRate,
            short.callTimeLimit,
            short.startTimestamp,
            short.callTimestamp,
            short.maxDuration,
            short.lender,
            short.seller
        );
    }

    function getShortLender(
        bytes32 id
    )
        view
        external
        returns (address _lender)
    {
        return state.shorts[id].lender;
    }

    function getShortSeller(
        bytes32 id
    )
        view
        external
        returns (address _seller)
    {
        return state.shorts[id].seller;
    }

    function getShortBaseToken(
        bytes32 id
    )
        view
        external
        returns (address _baseToken)
    {
        return state.shorts[id].baseToken;
    }

    function getShortUnderlyingToken(
        bytes32 id
    )
        view
        external
        returns (address _underlyingToken)
    {
        return state.shorts[id].underlyingToken;
    }

    function getShortAmount(
        bytes32 id
    )
        view
        external
        returns (uint _shortAmount)
    {
        return state.shorts[id].shortAmount;
    }

    function getShortClosedAmount(
        bytes32 id
    )
        view
        external
        returns (uint _closedAmount)
    {
        return state.shorts[id].closedAmount;
    }

    function getShortInterestRate(
        bytes32 id
    )
        view
        external
        returns (uint _interestRate)
    {
        return state.shorts[id].interestRate;
    }

    function getShortStartTimestamp(
        bytes32 id
    )
        view
        external
        returns (uint32 _startTimestamp)
    {
        return state.shorts[id].startTimestamp;
    }

    function getShortCallTimestamp(
        bytes32 id
    )
        view
        external
        returns (uint32 _callTimestamp)
    {
        return state.shorts[id].callTimestamp;
    }

    function getShortCallTimeLimit(
        bytes32 id
    )
        view
        external
        returns (uint32 _callTimeLimit)
    {
        return state.shorts[id].callTimeLimit;
    }

    function getShortMaxDuration(
        bytes32 id
    )
        view
        external
        returns (uint32 _maxDuration)
    {
        return state.shorts[id].maxDuration;
    }
}
