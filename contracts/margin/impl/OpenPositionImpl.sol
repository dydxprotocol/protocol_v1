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

pragma solidity 0.4.23;
pragma experimental "v0.5.0";

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { MarginCommon } from "./MarginCommon.sol";
import { MarginState } from "./MarginState.sol";
import { OpenPositionShared } from "./OpenPositionShared.sol";
import { TransferInternal } from "./TransferInternal.sol";
import { TimestampHelper } from "../../lib/TimestampHelper.sol";


/**
 * @title OpenPositionImpl
 * @author dYdX
 *
 * This library contains the implementation for the openPosition function of Margin
 */
library OpenPositionImpl {
    using SafeMath for uint256;

    // ============ Events ============

    /**
     * A position was opened
     */
    event PositionOpened(
        bytes32 indexed positionId,
        address indexed trader,
        address indexed lender,
        bytes32 loanHash,
        address owedToken,
        address heldToken,
        address loanFeeRecipient,
        uint256 principal,
        uint256 heldTokenFromSell,
        uint256 depositAmount,
        uint256 interestRate,
        uint32  callTimeLimit,
        uint32  maxDuration,
        bool    depositInHeldToken
    );

    // ============ Public Implementation Functions ============

    function openPositionImpl(
        MarginState.State storage state,
        address[11] addresses,
        uint256[10] values256,
        uint32[4] values32,
        uint8 sigV,
        bytes32[2] sigRS,
        bool depositInHeldToken,
        bytes orderData
    )
        public
        returns (bytes32)
    {
        OpenPositionShared.OpenTx memory transaction = parseOpenTx(
            addresses,
            values256,
            values32,
            sigV,
            sigRS,
            depositInHeldToken
        );

        require(
            !MarginCommon.containsPositionImpl(state, transaction.positionId),
            "OpenPositionImpl#openPositionImpl: positionId already exists"
        );

        uint256 heldTokenFromSell;

        (heldTokenFromSell,) = OpenPositionShared.openPositionInternalPreStateUpdate(
            state,
            transaction,
            orderData
        );

        // Comes before updateState() so that PositionOpened event is before Transferred events
        recordPositionOpened(
            msg.sender,
            transaction,
            heldTokenFromSell
        );

        updateState(
            state,
            transaction
        );

        return transaction.positionId;
    }

    // ============ Helper Functions ============

    function recordPositionOpened(
        address trader,
        OpenPositionShared.OpenTx transaction,
        uint256 heldTokenReceived
    )
        internal
    {
        emit PositionOpened(
            transaction.positionId,
            trader,
            transaction.loanOffering.payer,
            transaction.loanOffering.loanHash,
            transaction.loanOffering.owedToken,
            transaction.loanOffering.heldToken,
            transaction.loanOffering.feeRecipient,
            transaction.principal,
            heldTokenReceived,
            transaction.depositAmount,
            transaction.loanOffering.rates.interestRate,
            transaction.loanOffering.callTimeLimit,
            transaction.loanOffering.maxDuration,
            transaction.depositInHeldToken
        );
    }

    function updateState(
        MarginState.State storage state,
        OpenPositionShared.OpenTx transaction
    )
        internal
    {
        bytes32 positionId = transaction.positionId;
        assert(!MarginCommon.containsPositionImpl(state, positionId));

        state.positions[positionId].owedToken = transaction.loanOffering.owedToken;
        state.positions[positionId].heldToken = transaction.loanOffering.heldToken;
        state.positions[positionId].principal = transaction.principal;
        state.positions[positionId].callTimeLimit = transaction.loanOffering.callTimeLimit;
        state.positions[positionId].startTimestamp = TimestampHelper.getBlockTimestamp32();
        state.positions[positionId].maxDuration = transaction.loanOffering.maxDuration;
        state.positions[positionId].interestRate = transaction.loanOffering.rates.interestRate;
        state.positions[positionId].interestPeriod = transaction.loanOffering.rates.interestPeriod;

        bool newLender = transaction.loanOffering.owner != transaction.loanOffering.payer;
        bool newOwner = transaction.owner != msg.sender;

        state.positions[positionId].lender = TransferInternal.grantLoanOwnership(
            positionId,
            newLender ? transaction.loanOffering.payer : address(0),
            transaction.loanOffering.owner);

        state.positions[positionId].owner = TransferInternal.grantPositionOwnership(
            positionId,
            newOwner ? msg.sender : address(0),
            transaction.owner);
    }

    // ============ Parsing Functions ============

    function parseOpenTx(
        address[11] addresses,
        uint256[10] values256,
        uint32[4] values32,
        uint8 sigV,
        bytes32[2] sigRS,
        bool depositInHeldToken
    )
        internal
        view
        returns (OpenPositionShared.OpenTx memory)
    {
        OpenPositionShared.OpenTx memory transaction = OpenPositionShared.OpenTx({
            positionId: keccak256(
                msg.sender,
                values256[9] // nonce
            ),
            owner: addresses[0],
            principal: values256[7],
            lenderAmount: values256[7],
            depositAmount: values256[8],
            loanOffering: parseLoanOffering(
                addresses,
                values256,
                values32,
                sigV,
                sigRS
            ),
            exchangeWrapper: addresses[10],
            depositInHeldToken: depositInHeldToken,
            desiredTokenFromSell: 0
        });

        return transaction;
    }

    function parseLoanOffering(
        address[11] addresses,
        uint256[10] values256,
        uint32[4] values32,
        uint8 sigV,
        bytes32[2] sigRS
    )
        internal
        view
        returns (MarginCommon.LoanOffering memory)
    {
        MarginCommon.LoanOffering memory loanOffering = MarginCommon.LoanOffering({
            owedToken: addresses[1],
            heldToken: addresses[2],
            payer: addresses[3],
            signer: addresses[4],
            owner: addresses[5],
            taker: addresses[6],
            feeRecipient: addresses[7],
            lenderFeeToken: addresses[8],
            takerFeeToken: addresses[9],
            rates: parseLoanOfferRates(values256, values32),
            expirationTimestamp: values256[5],
            callTimeLimit: values32[0],
            maxDuration: values32[1],
            salt: values256[6],
            loanHash: 0,
            signature: parseLoanOfferingSignature(sigV, sigRS)
        });

        loanOffering.loanHash = MarginCommon.getLoanOfferingHash(loanOffering);

        return loanOffering;
    }

    function parseLoanOfferRates(
        uint256[10] values256,
        uint32[4] values32
    )
        internal
        pure
        returns (MarginCommon.LoanRates memory)
    {
        MarginCommon.LoanRates memory rates = MarginCommon.LoanRates({
            maxAmount: values256[0],
            minAmount: values256[1],
            minHeldToken: values256[2],
            interestRate: values32[2],
            lenderFee: values256[3],
            takerFee: values256[4],
            interestPeriod: values32[3]
        });

        return rates;
    }

    function parseLoanOfferingSignature(
        uint8 sigV,
        bytes32[2] sigRS
    )
        internal
        pure
        returns (MarginCommon.Signature memory)
    {
        MarginCommon.Signature memory signature = MarginCommon.Signature({
            v: sigV,
            r: sigRS[0],
            s: sigRS[1]
        });

        return signature;
    }
}
