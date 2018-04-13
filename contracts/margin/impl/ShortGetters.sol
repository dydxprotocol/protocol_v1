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
     * @param  marginId Unique ID of the position
     * @return          True if the short is exists and is open
     */
    function containsPosition(
        bytes32 marginId
    )
        view
        external
        returns (bool)
    {
        return MarginCommon.containsPositionImpl(state, marginId);
    }

    /**
     * Gets if a short is currently margin-called
     *
     * @param  marginId Unique ID of the position
     * @return          True if the short is margin-called
     */
    function isPositionCalled(
        bytes32 marginId
    )
        view
        external
        returns (bool)
    {
        return (state.positions[marginId].callTimestamp > 0);
    }

    /**
     * Gets if a short was previously closed
     *
     * @param  marginId Unique ID of the position
     * @return          True if the short is now closed
     */
    function isPositionClosed(
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
     * @param  marginId Unique ID of the position
     * @return          The number of quote tokens
     */
    function getPositionBalance(
        bytes32 marginId
    )
        view
        external
        returns (uint256)
    {
        if (!MarginCommon.containsPositionImpl(state, marginId)) {
            return 0;
        }

        return Vault(state.VAULT).balances(marginId, state.positions[marginId].quoteToken);
    }

    /**
     * Gets the time until the interest fee charged for the short will increase.
     * Returns 1 if the interest fee increases every second.
     * Returns 0 if the interest fee will never increase again.
     *
     * @param  marginId Unique ID of the position
     * @return          The number of seconds until the interest fee will increase
     */
    function getTimeUntilInterestIncrease(
        bytes32 marginId
    )
        view
        external
        returns (uint256)
    {
        MarginCommon.Position storage positionObject = MarginCommon.getPositionObject(state, marginId);

        uint256 nextStep = MarginCommon.calculateEffectiveTimeElapsed(
            positionObject,
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
     * @param  marginId Unique ID of the position
     * @return          The number of base tokens
     */
    function getPositionOwedAmount(
        bytes32 marginId
    )
        view
        external
        returns (uint256)
    {
        MarginCommon.Position storage positionObject = MarginCommon.getPositionObject(state, marginId);

        return MarginCommon.calculateOwedAmount(
            positionObject,
            positionObject.shortAmount.sub(positionObject.closedAmount),
            block.timestamp
        );
    }

    /**
     * Gets the amount of base tokens needed to close a given amount of the short at a given time,
     * including interest fees.
     *
     * @param  marginId     Unique ID of the position
     * @param  marginId     Amount of short being closed
     * @param  timestamp    Block timestamp in seconds of close
     * @return              The number of base tokens owed at the given time and amount
     */
    function getPositionOwedAmountAtTime(
        bytes32 marginId,
        uint256 amount,
        uint32  timestamp
    )
        view
        external
        returns (uint256)
    {
        MarginCommon.Position storage positionObject = MarginCommon.getPositionObject(state, marginId);

        return MarginCommon.calculateOwedAmount(
            positionObject,
            amount,
            timestamp
        );
    }

    /**
     * Gets the amount of base tokens that can be borrowed from a lender to add a given amount
     * onto the short at a given time.
     *
     * @param  marginId     Unique ID of the position
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
        MarginCommon.Position storage positionObject = MarginCommon.getPositionObject(state, marginId);

        return MarginCommon.calculateLenderAmountForAddValue(
            positionObject,
            amount,
            timestamp
        );
    }

    // --------------------------
    // ----- All Properties -----
    // --------------------------

    /**
     * Get a Position by id. This does not validate the position exists. If the position does not
     * exist, all 0's will be returned.
     *
     * @param  marginId Unique ID of the position
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
    function getPosition(
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
        MarginCommon.Position storage position = state.positions[marginId];

        return (
            [
                position.baseToken,
                position.quoteToken,
                position.lender,
                position.seller
            ],
            [
                position.shortAmount,
                position.closedAmount,
                position.requiredDeposit
            ],
            [
                position.callTimeLimit,
                position.startTimestamp,
                position.callTimestamp,
                position.maxDuration,
                position.interestRate,
                position.interestPeriod
            ]
        );
    }

    // ---------------------------------
    // ----- Individual Properties -----
    // ---------------------------------

    function getPositionLender(
        bytes32 marginId
    )
        view
        external
        returns (address)
    {
        return state.positions[marginId].lender;
    }

    function getPositionSeller(
        bytes32 marginId
    )
        view
        external
        returns (address)
    {
        return state.positions[marginId].seller;
    }

    function getPositionQuoteToken(
        bytes32 marginId
    )
        view
        external
        returns (address)
    {
        return state.positions[marginId].quoteToken;
    }

    function getPositionBaseToken(
        bytes32 marginId
    )
        view
        external
        returns (address)
    {
        return state.positions[marginId].baseToken;
    }

    function getPositionAmount(
        bytes32 marginId
    )
        view
        external
        returns (uint256)
    {
        return state.positions[marginId].shortAmount;
    }

    function getPositionClosedAmount(
        bytes32 marginId
    )
        view
        external
        returns (uint256)
    {
        return state.positions[marginId].closedAmount;
    }

    function getPositionUnclosedAmount(
        bytes32 marginId
    )
        view
        external
        returns (uint256)
    {
        return state.positions[marginId].shortAmount.sub(state.positions[marginId].closedAmount);
    }

    function getPositionInterestRate(
        bytes32 marginId
    )
        view
        external
        returns (uint256)
    {
        return state.positions[marginId].interestRate;
    }

    function getPositionRequiredDeposit(
        bytes32 marginId
    )
        view
        external
        returns (uint256)
    {
        return state.positions[marginId].requiredDeposit;
    }

    function getPositionStartTimestamp(
        bytes32 marginId
    )
        view
        external
        returns (uint32)
    {
        return state.positions[marginId].startTimestamp;
    }

    function getPositionCallTimestamp(
        bytes32 marginId
    )
        view
        external
        returns (uint32)
    {
        return state.positions[marginId].callTimestamp;
    }

    function getPositionCallTimeLimit(
        bytes32 marginId
    )
        view
        external
        returns (uint32)
    {
        return state.positions[marginId].callTimeLimit;
    }

    function getPositionMaxDuration(
        bytes32 marginId
    )
        view
        external
        returns (uint32)
    {
        return state.positions[marginId].maxDuration;
    }

    function getPositioninterestPeriod(
        bytes32 marginId
    )
        view
        external
        returns (uint32)
    {
        return state.positions[marginId].interestPeriod;
    }
}
