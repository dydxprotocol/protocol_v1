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

import { Math } from "openzeppelin-solidity/contracts/math/Math.sol";
import { SafeMath } from "openzeppelin-solidity/contracts/math/SafeMath.sol";
import { InterestImpl } from "./InterestImpl.sol";
import { MarginState } from "./MarginState.sol";
import { TransferInternal } from "./TransferInternal.sol";
import { Vault } from "../Vault.sol";
import { MathHelpers } from "../../lib/MathHelpers.sol";
import { TimestampHelper } from "../../lib/TimestampHelper.sol";


/**
 * @title MarginCommon
 * @author dYdX
 *
 * This library contains common functions for implementations of public facing Margin functions
 */
library MarginCommon {
    using SafeMath for uint256;

    // ============ Structs ============

    struct Position {
        address owedToken;       // Immutable
        address heldToken;       // Immutable
        address lender;
        address owner;
        uint256 principal;
        uint256 requiredDeposit;
        uint32  callTimeLimit;   // Immutable
        uint32  startTimestamp;  // Immutable, cannot be 0
        uint32  callTimestamp;
        uint32  maxDuration;     // Immutable
        uint32  interestRate;    // Immutable
        uint32  interestPeriod;  // Immutable
    }

    struct LoanOffering {
        address   owedToken;
        address   heldToken;
        address   payer;
        address   owner;
        address   taker;
        address   positionOwner;
        address   feeRecipient;
        address   lenderFeeToken;
        address   takerFeeToken;
        LoanRates rates;
        uint256   expirationTimestamp;
        uint32    callTimeLimit;
        uint32    maxDuration;
        uint256   salt;
        bytes32   loanHash;
        bytes     signature;
    }

    struct LoanRates {
        uint256 maxAmount;
        uint256 minAmount;
        uint256 minHeldToken;
        uint256 lenderFee;
        uint256 takerFee;
        uint32  interestRate;
        uint32  interestPeriod;
    }

    // ============ Internal Implementation Functions ============

    function storeNewPosition(
        MarginState.State storage state,
        bytes32 positionId,
        Position memory position,
        address loanPayer
    )
        internal
    {
        assert(!positionHasExisted(state, positionId));
        assert(position.owedToken != address(0));
        assert(position.heldToken != address(0));
        assert(position.owedToken != position.heldToken);
        assert(position.owner != address(0));
        assert(position.lender != address(0));
        assert(position.maxDuration != 0);
        assert(position.interestPeriod <= position.maxDuration);
        assert(position.callTimestamp == 0);
        assert(position.requiredDeposit == 0);

        state.positions[positionId].owedToken = position.owedToken;
        state.positions[positionId].heldToken = position.heldToken;
        state.positions[positionId].principal = position.principal;
        state.positions[positionId].callTimeLimit = position.callTimeLimit;
        state.positions[positionId].startTimestamp = TimestampHelper.getBlockTimestamp32();
        state.positions[positionId].maxDuration = position.maxDuration;
        state.positions[positionId].interestRate = position.interestRate;
        state.positions[positionId].interestPeriod = position.interestPeriod;

        state.positions[positionId].owner = TransferInternal.grantPositionOwnership(
            positionId,
            (position.owner != msg.sender) ? msg.sender : address(0),
            position.owner
        );

        state.positions[positionId].lender = TransferInternal.grantLoanOwnership(
            positionId,
            (position.lender != loanPayer) ? loanPayer : address(0),
            position.lender
        );
    }

    function getPositionIdFromNonce(
        uint256 nonce
    )
        internal
        view
        returns (bytes32)
    {
        return keccak256(abi.encodePacked(msg.sender, nonce));
    }

    function getUnavailableLoanOfferingAmountImpl(
        MarginState.State storage state,
        bytes32 loanHash
    )
        internal
        view
        returns (uint256)
    {
        return state.loanFills[loanHash].add(state.loanCancels[loanHash]);
    }

    function cleanupPosition(
        MarginState.State storage state,
        bytes32 positionId
    )
        internal
    {
        delete state.positions[positionId];
        state.closedPositions[positionId] = true;
    }

    function calculateOwedAmount(
        Position storage position,
        uint256 closeAmount,
        uint256 endTimestamp
    )
        internal
        view
        returns (uint256)
    {
        uint256 timeElapsed = calculateEffectiveTimeElapsed(position, endTimestamp);

        return InterestImpl.getCompoundedInterest(
            closeAmount,
            position.interestRate,
            timeElapsed
        );
    }

    /**
     * Calculates time elapsed rounded up to the nearest interestPeriod
     */
    function calculateEffectiveTimeElapsed(
        Position storage position,
        uint256 timestamp
    )
        internal
        view
        returns (uint256)
    {
        uint256 elapsed = timestamp.sub(position.startTimestamp);

        // round up to interestPeriod
        uint256 period = position.interestPeriod;
        if (period > 1) {
            elapsed = MathHelpers.divisionRoundedUp(elapsed, period).mul(period);
        }

        // bound by maxDuration
        return Math.min256(
            elapsed,
            position.maxDuration
        );
    }

    function calculateLenderAmountForIncreasePosition(
        Position storage position,
        uint256 principalToAdd,
        uint256 endTimestamp
    )
        internal
        view
        returns (uint256)
    {
        uint256 timeElapsed = calculateEffectiveTimeElapsedForNewLender(position, endTimestamp);

        return InterestImpl.getCompoundedInterest(
            principalToAdd,
            position.interestRate,
            timeElapsed
        );
    }

    function getLoanOfferingHash(
        LoanOffering loanOffering
    )
        internal
        view
        returns (bytes32)
    {
        return keccak256(
            abi.encodePacked(
                address(this),
                loanOffering.owedToken,
                loanOffering.heldToken,
                loanOffering.payer,
                loanOffering.owner,
                loanOffering.taker,
                loanOffering.positionOwner,
                loanOffering.feeRecipient,
                loanOffering.lenderFeeToken,
                loanOffering.takerFeeToken,
                getValuesHash(loanOffering)
            )
        );
    }

    function getPositionBalanceImpl(
        MarginState.State storage state,
        bytes32 positionId
    )
        internal
        view
        returns(uint256)
    {
        return Vault(state.VAULT).balances(positionId, state.positions[positionId].heldToken);
    }

    function containsPositionImpl(
        MarginState.State storage state,
        bytes32 positionId
    )
        internal
        view
        returns (bool)
    {
        return state.positions[positionId].startTimestamp != 0;
    }

    function positionHasExisted(
        MarginState.State storage state,
        bytes32 positionId
    )
        internal
        view
        returns (bool)
    {
        return containsPositionImpl(state, positionId) || state.closedPositions[positionId];
    }

    function getPositionFromStorage(
        MarginState.State storage state,
        bytes32 positionId
    )
        internal
        view
        returns (Position storage)
    {
        Position storage position = state.positions[positionId];

        require(
            position.startTimestamp != 0,
            "MarginCommon#getPositionFromStorage: The position does not exist"
        );

        return position;
    }

    // ============ Private Helper-Functions ============

    /**
     * Calculates time elapsed rounded down to the nearest interestPeriod
     */
    function calculateEffectiveTimeElapsedForNewLender(
        Position storage position,
        uint256 timestamp
    )
        private
        view
        returns (uint256)
    {
        uint256 elapsed = timestamp.sub(position.startTimestamp);

        // round down to interestPeriod
        uint256 period = position.interestPeriod;
        if (period > 1) {
            elapsed = elapsed.div(period).mul(period);
        }

        // bound by maxDuration
        return Math.min256(
            elapsed,
            position.maxDuration
        );
    }

    function getValuesHash(
        LoanOffering loanOffering
    )
        private
        pure
        returns (bytes32)
    {
        return keccak256(
            abi.encodePacked(
                loanOffering.rates.maxAmount,
                loanOffering.rates.minAmount,
                loanOffering.rates.minHeldToken,
                loanOffering.rates.lenderFee,
                loanOffering.rates.takerFee,
                loanOffering.expirationTimestamp,
                loanOffering.salt,
                loanOffering.callTimeLimit,
                loanOffering.maxDuration,
                loanOffering.rates.interestRate,
                loanOffering.rates.interestPeriod
            )
        );
    }
}
