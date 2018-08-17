/*

    Copyright 2018 dYdX Trading Inc.

    Licensed under the Apache License, Version 2.0 (the "License");
    you may not use this file except in compliance with the License.
    You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

    Unless required by applicable law or agreed to in writing, software
    distributed under the License is distributed on an "AS IS" BASIS,
    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
    See the License for the specific language governing permissions and
    limitations under the License.

*/

pragma solidity 0.4.24;
pragma experimental "v0.5.0";

import { SafeMath } from "openzeppelin-solidity/contracts/math/SafeMath.sol";
import { MarginCommon } from "./MarginCommon.sol";
import { MarginStorage } from "./MarginStorage.sol";
import { Vault } from "../Vault.sol";


/**
 * @title PositionGetters
 * @author dYdX
 *
 * A collection of public constant getter functions that allows reading of the state of any position
 * stored in the dYdX protocol.
 */
contract PositionGetters is MarginStorage {
    using SafeMath for uint256;

    // ============ Public Constant Functions ============

    /**
     * Gets if a position is currently open.
     *
     * @param  positionId  Unique ID of the position
     * @return             True if the position is exists and is open
     */
    function containsPosition(
        bytes32 positionId
    )
        external
        view
        returns (bool)
    {
        return MarginCommon.containsPositionImpl(state, positionId);
    }

    /**
     * Gets if a position is currently margin-called.
     *
     * @param  positionId  Unique ID of the position
     * @return             True if the position is margin-called
     */
    function isPositionCalled(
        bytes32 positionId
    )
        external
        view
        returns (bool)
    {
        return (state.positions[positionId].callTimestamp > 0);
    }

    /**
     * Gets if a position was previously open and is now closed.
     *
     * @param  positionId  Unique ID of the position
     * @return             True if the position is now closed
     */
    function isPositionClosed(
        bytes32 positionId
    )
        external
        view
        returns (bool)
    {
        return state.closedPositions[positionId];
    }

    /**
     * Gets the total amount of owedToken ever repaid to the lender for a position.
     *
     * @param  positionId  Unique ID of the position
     * @return             Total amount of owedToken ever repaid
     */
    function getTotalOwedTokenRepaidToLender(
        bytes32 positionId
    )
        external
        view
        returns (uint256)
    {
        return state.totalOwedTokenRepaidToLender[positionId];
    }

    /**
     * Gets the amount of heldToken currently locked up in Vault for a particular position.
     *
     * @param  positionId  Unique ID of the position
     * @return             The amount of heldToken
     */
    function getPositionBalance(
        bytes32 positionId
    )
        external
        view
        returns (uint256)
    {
        return MarginCommon.getPositionBalanceImpl(state, positionId);
    }

    /**
     * Gets the time until the interest fee charged for the position will increase.
     * Returns 1 if the interest fee increases every second.
     * Returns 0 if the interest fee will never increase again.
     *
     * @param  positionId  Unique ID of the position
     * @return             The number of seconds until the interest fee will increase
     */
    function getTimeUntilInterestIncrease(
        bytes32 positionId
    )
        external
        view
        returns (uint256)
    {
        MarginCommon.Position storage position =
            MarginCommon.getPositionFromStorage(state, positionId);

        uint256 effectiveTimeElapsed = MarginCommon.calculateEffectiveTimeElapsed(
            position,
            block.timestamp
        );

        uint256 absoluteTimeElapsed = block.timestamp.sub(position.startTimestamp);
        if (absoluteTimeElapsed > effectiveTimeElapsed) { // past maxDuration
            return 0;
        } else {
            // nextStep is the final second at which the calculated interest fee is the same as it
            // is currently, so add 1 to get the correct value
            return effectiveTimeElapsed.add(1).sub(absoluteTimeElapsed);
        }
    }

    /**
     * Gets the amount of owedTokens currently needed to close the position completely, including
     * interest fees.
     *
     * @param  positionId  Unique ID of the position
     * @return             The number of owedTokens
     */
    function getPositionOwedAmount(
        bytes32 positionId
    )
        external
        view
        returns (uint256)
    {
        MarginCommon.Position storage position =
            MarginCommon.getPositionFromStorage(state, positionId);

        return MarginCommon.calculateOwedAmount(
            position,
            position.principal,
            block.timestamp
        );
    }

    /**
     * Gets the amount of owedTokens needed to close a given principal amount of the position at a
     * given time, including interest fees.
     *
     * @param  positionId         Unique ID of the position
     * @param  principalToClose   Amount of principal being closed
     * @param  timestamp          Block timestamp in seconds of close
     * @return                    The number of owedTokens owed
     */
    function getPositionOwedAmountAtTime(
        bytes32 positionId,
        uint256 principalToClose,
        uint32  timestamp
    )
        external
        view
        returns (uint256)
    {
        MarginCommon.Position storage position =
            MarginCommon.getPositionFromStorage(state, positionId);

        require(
            timestamp >= position.startTimestamp,
            "PositionGetters#getPositionOwedAmountAtTime: Requested time before position started"
        );

        return MarginCommon.calculateOwedAmount(
            position,
            principalToClose,
            timestamp
        );
    }

    /**
     * Gets the amount of owedTokens that can be borrowed from a lender to add a given principal
     * amount to the position at a given time.
     *
     * @param  positionId      Unique ID of the position
     * @param  principalToAdd  Amount being added to principal
     * @param  timestamp       Block timestamp in seconds of addition
     * @return                 The number of owedTokens that will be borrowed
     */
    function getLenderAmountForIncreasePositionAtTime(
        bytes32 positionId,
        uint256 principalToAdd,
        uint32  timestamp
    )
        external
        view
        returns (uint256)
    {
        MarginCommon.Position storage position =
            MarginCommon.getPositionFromStorage(state, positionId);

        require(
            timestamp >= position.startTimestamp,
            "PositionGetters#getLenderAmountForIncreasePositionAtTime: timestamp < position start"
        );

        return MarginCommon.calculateLenderAmountForIncreasePosition(
            position,
            principalToAdd,
            timestamp
        );
    }

    // ============ All Properties ============

    /**
     * Get a Position by id. This does not validate the position exists. If the position does not
     * exist, all 0's will be returned.
     *
     * @param  positionId  Unique ID of the position
     * @return             Addresses corresponding to:
     *
     *                     [0] = owedToken
     *                     [1] = heldToken
     *                     [2] = lender
     *                     [3] = owner
     *
     *                     Values corresponding to:
     *
     *                     [0] = principal
     *                     [1] = requiredDeposit
     *
     *                     Values corresponding to:
     *
     *                     [0] = callTimeLimit
     *                     [1] = startTimestamp
     *                     [2] = callTimestamp
     *                     [3] = maxDuration
     *                     [4] = interestRate
     *                     [5] = interestPeriod
     */
    function getPosition(
        bytes32 positionId
    )
        external
        view
        returns (
            address[4],
            uint256[2],
            uint32[6]
        )
    {
        MarginCommon.Position storage position = state.positions[positionId];

        return (
            [
                position.owedToken,
                position.heldToken,
                position.lender,
                position.owner
            ],
            [
                position.principal,
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

    // ============ Individual Properties ============

    function getPositionLender(
        bytes32 positionId
    )
        external
        view
        returns (address)
    {
        return state.positions[positionId].lender;
    }

    function getPositionOwner(
        bytes32 positionId
    )
        external
        view
        returns (address)
    {
        return state.positions[positionId].owner;
    }

    function getPositionHeldToken(
        bytes32 positionId
    )
        external
        view
        returns (address)
    {
        return state.positions[positionId].heldToken;
    }

    function getPositionOwedToken(
        bytes32 positionId
    )
        external
        view
        returns (address)
    {
        return state.positions[positionId].owedToken;
    }

    function getPositionPrincipal(
        bytes32 positionId
    )
        external
        view
        returns (uint256)
    {
        return state.positions[positionId].principal;
    }

    function getPositionInterestRate(
        bytes32 positionId
    )
        external
        view
        returns (uint256)
    {
        return state.positions[positionId].interestRate;
    }

    function getPositionRequiredDeposit(
        bytes32 positionId
    )
        external
        view
        returns (uint256)
    {
        return state.positions[positionId].requiredDeposit;
    }

    function getPositionStartTimestamp(
        bytes32 positionId
    )
        external
        view
        returns (uint32)
    {
        return state.positions[positionId].startTimestamp;
    }

    function getPositionCallTimestamp(
        bytes32 positionId
    )
        external
        view
        returns (uint32)
    {
        return state.positions[positionId].callTimestamp;
    }

    function getPositionCallTimeLimit(
        bytes32 positionId
    )
        external
        view
        returns (uint32)
    {
        return state.positions[positionId].callTimeLimit;
    }

    function getPositionMaxDuration(
        bytes32 positionId
    )
        external
        view
        returns (uint32)
    {
        return state.positions[positionId].maxDuration;
    }

    function getPositioninterestPeriod(
        bytes32 positionId
    )
        external
        view
        returns (uint32)
    {
        return state.positions[positionId].interestPeriod;
    }
}
