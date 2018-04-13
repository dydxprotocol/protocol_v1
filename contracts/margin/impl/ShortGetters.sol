pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { MarginCommon } from "./MarginCommon.sol";
import { MarginStorage } from "./MarginStorage.sol";
import { Vault } from "../Vault.sol";


/**
 * @title ShortGetters
 * @author dYdX
 *
 * A collection of public constant getter functions that allow users and applications to read the
 * state of any short stored in the dYdX protocol.
 */
contract ShortGetters is MarginStorage {
    using SafeMath for uint256;

    // -------------------------------------
    // ----- Public Constant Functions -----
    // -------------------------------------

    /**
     * Gets if a short is currently open
     *
     * @param  marginId Unique ID of the short
     * @return          True if the short is exists and is open
     */
    function containsShort(
        bytes32 marginId
    )
        view
        external
        returns (bool)
    {
        return MarginCommon.containsShortImpl(state, marginId);
    }

    /**
     * Gets if a short is currently margin-called
     *
     * @param  marginId Unique ID of the short
     * @return          True if the short is margin-called
     */
    function isShortCalled(
        bytes32 marginId
    )
        view
        external
        returns (bool)
    {
        return (state.shorts[marginId].callTimestamp > 0);
    }

    /**
     * Gets if a short was previously closed
     *
     * @param  marginId Unique ID of the short
     * @return          True if the short is now closed
     */
    function isShortClosed(
        bytes32 marginId
    )
        view
        external
        returns (bool)
    {
        return state.closedShorts[marginId];
    }

    /**
     * Gets the number of quote tokens currently locked up in Vault for a particular short
     *
     * @param  marginId Unique ID of the short
     * @return          The number of quote tokens
     */
    function getShortBalance(
        bytes32 marginId
    )
        view
        external
        returns (uint256)
    {
        if (!MarginCommon.containsShortImpl(state, marginId)) {
            return 0;
        }

        return Vault(state.VAULT).balances(marginId, state.shorts[marginId].quoteToken);
    }

    /**
     * Gets the time until the interest fee charged for the short will increase.
     * Returns 1 if the interest fee increases every second.
     * Returns 0 if the interest fee will never increase again.
     *
     * @param  marginId Unique ID of the short
     * @return          The number of seconds until the interest fee will increase
     */
    function getTimeUntilInterestIncrease(
        bytes32 marginId
    )
        view
        external
        returns (uint256)
    {
        MarginCommon.Short storage shortObject = MarginCommon.getShortObject(state, marginId);

        uint256 nextStep = MarginCommon.calculateEffectiveTimeElapsed(
            shortObject,
            block.timestamp
        );

        if (block.timestamp > nextStep) { // past maxDuration
            return 0;
        } else {
            // nextStep is the final second at which the calculated interest fee is the same as it
            // is currently, so add 1 to get the correct value
            return nextStep.add(1).sub(block.timestamp);
        }
    }

    /**
     * Gets the amount of base tokens currently needed to close the short completely, including
     * interest fees.
     *
     * @param  marginId Unique ID of the short
     * @return          The number of base tokens
     */
    function getShortOwedAmount(
        bytes32 marginId
    )
        view
        external
        returns (uint256)
    {
        MarginCommon.Short storage shortObject = MarginCommon.getShortObject(state, marginId);

        return MarginCommon.calculateOwedAmount(
            shortObject,
            shortObject.shortAmount.sub(shortObject.closedAmount),
            block.timestamp
        );
    }

    /**
     * Gets the amount of base tokens needed to close a given amount of the short at a given time,
     * including interest fees.
     *
     * @param  marginId     Unique ID of the short
     * @param  marginId     Amount of short being closed
     * @param  timestamp    Block timestamp in seconds of close
     * @return              The number of base tokens owed at the given time and amount
     */
    function getShortOwedAmountAtTime(
        bytes32 marginId,
        uint256 amount,
        uint32  timestamp
    )
        view
        external
        returns (uint256)
    {
        MarginCommon.Short storage shortObject = MarginCommon.getShortObject(state, marginId);

        return MarginCommon.calculateOwedAmount(
            shortObject,
            amount,
            timestamp
        );
    }

    /**
     * Gets the amount of base tokens that can be borrowed from a lender to add a given amount
     * onto the short at a given time.
     *
     * @param  marginId     Unique ID of the short
     * @param  marginId     Amount being added to short
     * @param  timestamp    Block timestamp in seconds of addition
     * @return              The number of base tokens that can be borrowed at the given
     *                      time and amount
     */
    function getLenderAmountForAddValueAtTime(
        bytes32 marginId,
        uint256 amount,
        uint32  timestamp
    )
        view
        external
        returns (uint256)
    {
        MarginCommon.Short storage shortObject = MarginCommon.getShortObject(state, marginId);

        return MarginCommon.calculateLenderAmountForAddValue(
            shortObject,
            amount,
            timestamp
        );
    }

    // --------------------------
    // ----- All Properties -----
    // --------------------------

    /**
     * Get a Short by id. This does not validate the short exists. If the short does not exist
     * all 0's will be returned.
     *
     * @param  marginId Unique ID of the short
     * @return          Addresses corresponding to:
     *
     *                  [0] = baseToken
     *                  [1] = quoteToken
     *                  [2] = lender
     *                  [3] = seller
     *
     *                  Values corresponding to:
     *
     *                  [0] = shortAmount
     *                  [1] = closedAmount
     *                  [2] = requiredDeposit
     *
     *                  Values corresponding to:
     *
     *                  [0] = callTimeLimit
     *                  [1] = startTimestamp
     *                  [2] = callTimestamp
     *                  [3] = maxDuration
     *                  [4] = interestRate
     *                  [5] = interestPeriod
     */
    function getShort(
        bytes32 marginId
    )
        view
        external
        returns (
            address[4],
            uint256[3],
            uint32[6]
        )
    {
        MarginCommon.Short storage short = state.shorts[marginId];

        return (
            [
                short.baseToken,
                short.quoteToken,
                short.lender,
                short.seller
            ],
            [
                short.shortAmount,
                short.closedAmount,
                short.requiredDeposit
            ],
            [
                short.callTimeLimit,
                short.startTimestamp,
                short.callTimestamp,
                short.maxDuration,
                short.interestRate,
                short.interestPeriod
            ]
        );
    }

    // ---------------------------------
    // ----- Individual Properties -----
    // ---------------------------------

    function getShortLender(
        bytes32 marginId
    )
        view
        external
        returns (address)
    {
        return state.shorts[marginId].lender;
    }

    function getshortSeller(
        bytes32 marginId
    )
        view
        external
        returns (address)
    {
        return state.shorts[marginId].seller;
    }

    function getShortQuoteToken(
        bytes32 marginId
    )
        view
        external
        returns (address)
    {
        return state.shorts[marginId].quoteToken;
    }

    function getShortBaseToken(
        bytes32 marginId
    )
        view
        external
        returns (address)
    {
        return state.shorts[marginId].baseToken;
    }

    function getShortAmount(
        bytes32 marginId
    )
        view
        external
        returns (uint256)
    {
        return state.shorts[marginId].shortAmount;
    }

    function getShortClosedAmount(
        bytes32 marginId
    )
        view
        external
        returns (uint256)
    {
        return state.shorts[marginId].closedAmount;
    }

    function getShortUnclosedAmount(
        bytes32 marginId
    )
        view
        external
        returns (uint256)
    {
        return state.shorts[marginId].shortAmount.sub(state.shorts[marginId].closedAmount);
    }

    function getShortInterestRate(
        bytes32 marginId
    )
        view
        external
        returns (uint256)
    {
        return state.shorts[marginId].interestRate;
    }

    function getShortRequiredDeposit(
        bytes32 marginId
    )
        view
        external
        returns (uint256)
    {
        return state.shorts[marginId].requiredDeposit;
    }

    function getShortStartTimestamp(
        bytes32 marginId
    )
        view
        external
        returns (uint32)
    {
        return state.shorts[marginId].startTimestamp;
    }

    function getShortCallTimestamp(
        bytes32 marginId
    )
        view
        external
        returns (uint32)
    {
        return state.shorts[marginId].callTimestamp;
    }

    function getShortCallTimeLimit(
        bytes32 marginId
    )
        view
        external
        returns (uint32)
    {
        return state.shorts[marginId].callTimeLimit;
    }

    function getShortMaxDuration(
        bytes32 marginId
    )
        view
        external
        returns (uint32)
    {
        return state.shorts[marginId].maxDuration;
    }

    function getShortinterestPeriod(
        bytes32 marginId
    )
        view
        external
        returns (uint32)
    {
        return state.shorts[marginId].interestPeriod;
    }
}
