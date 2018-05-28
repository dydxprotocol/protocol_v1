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

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { BorrowShared } from "./BorrowShared.sol";
import { MarginCommon } from "./MarginCommon.sol";
import { MarginState } from "./MarginState.sol";
import { MathHelpers } from "../../lib/MathHelpers.sol";


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
        BorrowShared.Tx memory transaction = parseOpenTx(
            addresses,
            values256,
            values32,
            sigV,
            sigRS,
            depositInHeldToken
        );

        require(
            !MarginCommon.positionHasExisted(state, transaction.positionId),
            "OpenPositionImpl#openPositionImpl: positionId already exists"
        );

        doBorrowAndSell(state, transaction, orderData);

        // Before doStoreNewPosition() so that PositionOpened event is before Transferred events
        recordPositionOpened(
            msg.sender,
            transaction
        );

        doStoreNewPosition(
            state,
            transaction
        );

        return transaction.positionId;
    }

    // ============ Helper Functions ============

    function doBorrowAndSell(
        MarginState.State storage state,
        BorrowShared.Tx memory transaction,
        bytes orderData
    )
        internal
    {
        BorrowShared.doPreSell(state, transaction);

        if (transaction.depositInHeldToken) {
            BorrowShared.doDepositHeldToken(state, transaction);
        } else {
            BorrowShared.doDepositOwedToken(state, transaction);
        }

        transaction.heldTokenFromSell = BorrowShared.doSell(
            state,
            transaction,
            orderData,
            MathHelpers.maxUint256()
        );

        BorrowShared.doPostSell(state, transaction);
    }

    function doStoreNewPosition(
        MarginState.State storage state,
        BorrowShared.Tx memory transaction
    )
        internal
    {
        MarginCommon.storeNewPosition(
            state,
            transaction.positionId,
            MarginCommon.Position({
                owedToken: transaction.loanOffering.owedToken,
                heldToken: transaction.loanOffering.heldToken,
                lender: transaction.loanOffering.owner,
                owner: transaction.owner,
                principal: transaction.principal,
                requiredDeposit: 0,
                callTimeLimit: transaction.loanOffering.callTimeLimit,
                startTimestamp: 0,
                callTimestamp: 0,
                maxDuration: transaction.loanOffering.maxDuration,
                interestRate: transaction.loanOffering.rates.interestRate,
                interestPeriod: transaction.loanOffering.rates.interestPeriod
            }),
            transaction.loanOffering.payer
        );
    }

    function recordPositionOpened(
        address trader,
        BorrowShared.Tx transaction
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
            transaction.heldTokenFromSell,
            transaction.depositAmount,
            transaction.loanOffering.rates.interestRate,
            transaction.loanOffering.callTimeLimit,
            transaction.loanOffering.maxDuration,
            transaction.depositInHeldToken
        );
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
        returns (BorrowShared.Tx memory)
    {
        BorrowShared.Tx memory transaction = BorrowShared.Tx({
            positionId: MarginCommon.getPositionIdFromNonce(values256[9]),
            owner: addresses[0],
            principal: values256[7],
            lenderAmount: values256[7],
            loanOffering: parseLoanOffering(
                addresses,
                values256,
                values32,
                sigV,
                sigRS
            ),
            exchangeWrapper: addresses[10],
            depositInHeldToken: depositInHeldToken,
            depositAmount: values256[8],
            collateralAmount: 0, // set later
            heldTokenFromSell: 0 // set later
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
