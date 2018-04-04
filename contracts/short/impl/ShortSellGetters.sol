pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { ShortSellCommon } from "./ShortSellCommon.sol";
import { ShortSellStorage } from "./ShortSellStorage.sol";


contract ShortSellGetters is ShortSellStorage {
    using SafeMath for uint256;
    // -------------------------------------
    // ----- Public Constant Functions -----
    // -------------------------------------

    /**
     * Get a Short by id. This does not validate the short exists. If the short does not exist
     * all 0's will be returned.
     * @param  id  unique ID of the short
     * @return
     *   Addresses corresponding to:
     *    [0] = underlyingToken
     *    [1] = quoteToken
     *    [2] = lender
     *    [3] = seller
     *  Values corresponding to:
     *    [0] = shortAmount
     *    [1] = closedAmount
     *    [2] = interestRate
     *    [3] = requiredDeposit
     *  Values corresponding to:
     *    [0] = callTimeLimit
     *    [1] = startTimestamp
     *    [2] = callTimestamp
     *    [3] = maxDuration
     *    [4] = interestPeriod
     */
    function getShort(
        bytes32 id
    )
        view
        external
        returns (
            address[4],
            uint256[4],
            uint32[5]
        )
    {
        ShortSellCommon.Short storage short = state.shorts[id];

        return (
            [
                short.underlyingToken,
                short.quoteToken,
                short.lender,
                short.seller
            ],
            [
                short.shortAmount,
                short.closedAmount,
                short.interestRate,
                short.requiredDeposit
            ],
            [
                short.callTimeLimit,
                short.startTimestamp,
                short.callTimestamp,
                short.maxDuration,
                short.interestPeriod
            ]
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

    function getShortQuoteToken(
        bytes32 id
    )
        view
        external
        returns (address _quoteToken)
    {
        return state.shorts[id].quoteToken;
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
        returns (uint256 _shortAmount)
    {
        return state.shorts[id].shortAmount;
    }

    function getShortClosedAmount(
        bytes32 id
    )
        view
        external
        returns (uint256 _closedAmount)
    {
        return state.shorts[id].closedAmount;
    }

    function getShortUnclosedAmount(
        bytes32 id
    )
        view
        external
        returns (uint256 _closedAmount)
    {
        return state.shorts[id].shortAmount.sub(state.shorts[id].closedAmount);
    }

    function getShortInterestRate(
        bytes32 id
    )
        view
        external
        returns (uint256 _interestRate)
    {
        return state.shorts[id].interestRate;
    }

    function getShortRequiredDeposit(
        bytes32 id
    )
        view
        external
        returns (uint256 _requiredDeposit)
    {
        return state.shorts[id].requiredDeposit;
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

    function getShortinterestPeriod(
        bytes32 id
    )
        view
        external
        returns (uint32 _maxDuration)
    {
        return state.shorts[id].interestPeriod;
    }
}
