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

import { AddressUtils } from "zeppelin-solidity/contracts/AddressUtils.sol";
import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { BorrowShared } from "./BorrowShared.sol";
import { MarginCommon } from "./MarginCommon.sol";
import { MarginState } from "./MarginState.sol";
import { Vault } from "../Vault.sol";
import { MathHelpers } from "../../lib/MathHelpers.sol";
import { ExchangeWrapper } from "../interfaces/ExchangeWrapper.sol";
import { IncreaseLoanDelegator } from "../interfaces/lender/IncreaseLoanDelegator.sol";
import { IncreasePositionDelegator } from "../interfaces/owner/IncreasePositionDelegator.sol";


/**
 * @title IncreasePositionImpl
 * @author dYdX
 *
 * This library contains the implementation for the increasePosition function of Margin
 */
library IncreasePositionImpl {
    using SafeMath for uint256;

    // ============ Events ============

    /*
     * A position was increased
     */
    event PositionIncreased(
        bytes32 indexed positionId,
        address indexed trader,
        address indexed lender,
        address positionOwner,
        address loanOwner,
        bytes32 loanHash,
        address loanFeeRecipient,
        uint256 amountBorrowed,
        uint256 principalAdded,
        uint256 heldTokenFromSell,
        uint256 depositAmount,
        bool    depositInHeldToken
    );

    // ============ Public Implementation Functions ============

    function increasePositionImpl(
        MarginState.State storage state,
        bytes32 positionId,
        address[8] addresses,
        uint256[8] values256,
        uint32[2] values32,
        uint8 sigV,
        bytes32[2] sigRS,
        bool depositInHeldToken,
        bytes orderData
    )
        public
        returns (uint256)
    {
        // Also ensures that the position exists
        MarginCommon.Position storage position =
            MarginCommon.getPositionFromStorage(state, positionId);

        BorrowShared.Tx memory transaction = parseIncreasePositionTx(
            position,
            positionId,
            addresses,
            values256,
            values32,
            sigV,
            sigRS,
            depositInHeldToken
        );

        validateIncrease(state, transaction, position);

        doBorrowAndSell(state, transaction, orderData);

        updateState(
            position,
            transaction.positionId,
            transaction.principal,
            transaction.lenderAmount,
            transaction.loanOffering.payer
        );

        // LOG EVENT
        recordPositionIncreased(transaction, position);

        return transaction.lenderAmount;
    }

    function increaseWithoutCounterpartyImpl(
        MarginState.State storage state,
        bytes32 positionId,
        uint256 principalToAdd
    )
        public
        returns (uint256)
    {
        MarginCommon.Position storage position =
            MarginCommon.getPositionFromStorage(state, positionId);

        // Disallow adding 0 principal
        require(
            principalToAdd > 0,
            "IncreasePositionImpl#increaseWithoutCounterpartyImpl: Cannot add 0 principal"
        );

        // Disallow additions after maximum duration
        require(
            block.timestamp < uint256(position.startTimestamp).add(position.maxDuration),
            "IncreasePositionImpl#increaseWithoutCounterpartyImpl: Cannot increase after maxDuration"
        );

        uint256 heldTokenAmount = getCollateralNeededForAddedPrincipal(
            state,
            position,
            positionId,
            principalToAdd
        );

        Vault(state.VAULT).transferToVault(
            positionId,
            position.heldToken,
            msg.sender,
            heldTokenAmount
        );

        updateState(
            position,
            positionId,
            principalToAdd,
            0, // lent amount
            msg.sender
        );

        emit PositionIncreased(
            positionId,
            msg.sender,
            msg.sender,
            position.owner,
            position.lender,
            "",
            address(0),
            0,
            principalToAdd,
            0,
            heldTokenAmount,
            true
        );

        return heldTokenAmount;
    }

    // ============ Helper Functions ============

    function doBorrowAndSell(
        MarginState.State storage state,
        BorrowShared.Tx memory transaction,
        bytes orderData
    )
        internal
    {
        // Calculate the number of heldTokens to add
        uint256 collateralToAdd = getCollateralNeededForAddedPrincipal(
            state,
            state.positions[transaction.positionId],
            transaction.positionId,
            transaction.principal
        );

        // Do pre-exchange validations
        BorrowShared.doPreSell(state, transaction);

        // Calculate and deposit owedToken
        uint256 maxHeldTokenFromSell = MathHelpers.maxUint256();
        if (!transaction.depositInHeldToken) {
            transaction.depositAmount =
                getOwedTokenDeposit(transaction, collateralToAdd, orderData);
            BorrowShared.doDepositOwedToken(state, transaction);
            maxHeldTokenFromSell = collateralToAdd;
        }

        // Sell owedToken for heldToken using the exchange wrapper
        transaction.heldTokenFromSell = BorrowShared.doSell(
            state,
            transaction,
            orderData,
            maxHeldTokenFromSell
        );

        // Calculate and deposit heldToken
        if (transaction.depositInHeldToken) {
            require(
                transaction.heldTokenFromSell <= collateralToAdd,
                "IncreasePositionImpl#doBorrowAndSell: DEX order gives too much heldToken"
            );
            transaction.depositAmount = collateralToAdd.sub(transaction.heldTokenFromSell);
            BorrowShared.doDepositHeldToken(state, transaction);
        }

        // Make sure the actual added collateral is what is expected
        assert(transaction.collateralAmount == collateralToAdd);

        // Do post-exchange validations
        BorrowShared.doPostSell(state, transaction);
    }

    function getOwedTokenDeposit(
        BorrowShared.Tx transaction,
        uint256 collateralToAdd,
        bytes orderData
    )
        internal
        view
        returns (uint256)
    {
        uint256 totalOwedToken = ExchangeWrapper(transaction.exchangeWrapper).getExchangeCost(
            transaction.loanOffering.heldToken,
            transaction.loanOffering.owedToken,
            collateralToAdd,
            orderData
        );

        require(
            transaction.lenderAmount <= totalOwedToken,
            "IncreasePositionImpl#getOwedTokenDeposit: Lender amount is more than required"
        );

        return totalOwedToken.sub(transaction.lenderAmount);
    }

    function validateIncrease(
        MarginState.State storage state,
        BorrowShared.Tx transaction,
        MarginCommon.Position storage position
    )
        internal
        view
    {
        assert(MarginCommon.containsPositionImpl(state, transaction.positionId));

        require(
            position.callTimeLimit <= transaction.loanOffering.callTimeLimit,
            "IncreasePositionImpl#validateIncrease: Loan callTimeLimit is less than the position"
        );

        // require the position to end no later than the loanOffering's maximum acceptable end time
        uint256 positionEndTimestamp = uint256(position.startTimestamp).add(position.maxDuration);
        uint256 offeringEndTimestamp = block.timestamp.add(transaction.loanOffering.maxDuration);
        require(
            positionEndTimestamp <= offeringEndTimestamp,
            "IncreasePositionImpl#validateIncrease: Loan end timestamp is less than the position"
        );

        require(
            block.timestamp < positionEndTimestamp,
            "IncreasePositionImpl#validateIncrease: Position has passed its maximum duration"
        );
    }

    function getCollateralNeededForAddedPrincipal(
        MarginState.State storage state,
        MarginCommon.Position storage position,
        bytes32 positionId,
        uint256 principalToAdd
    )
        internal
        view
        returns (uint256)
    {
        uint256 heldTokenBalance = MarginCommon.getPositionBalanceImpl(state, positionId);

        return MathHelpers.getPartialAmountRoundedUp(
            principalToAdd,
            position.principal,
            heldTokenBalance
        );
    }

    function updateState(
        MarginCommon.Position storage position,
        bytes32 positionId,
        uint256 principalAdded,
        uint256 owedTokenLent,
        address loanPayer
    )
        internal
    {
        position.principal = position.principal.add(principalAdded);

        address owner = position.owner;
        address lender = position.lender;

        // Ensure owner consent
        increasePositionOnBehalfOfRecurse(
            owner,
            msg.sender,
            positionId,
            principalAdded
        );

        // Ensure lender consent
        increaseLoanOnBehalfOfRecurse(
            lender,
            loanPayer,
            positionId,
            principalAdded,
            owedTokenLent
        );
    }

    function increasePositionOnBehalfOfRecurse(
        address contractAddr,
        address trader,
        bytes32 positionId,
        uint256 principalAdded
    )
        internal
    {
        // Assume owner approval if not a smart contract and they increased their own position
        if (trader == contractAddr && !AddressUtils.isContract(contractAddr)) {
            return;
        }

        address newContractAddr =
            IncreasePositionDelegator(contractAddr).increasePositionOnBehalfOf(
                trader,
                positionId,
                principalAdded
            );

        if (newContractAddr != contractAddr) {
            increasePositionOnBehalfOfRecurse(
                newContractAddr,
                trader,
                positionId,
                principalAdded
            );
        }
    }

    function increaseLoanOnBehalfOfRecurse(
        address contractAddr,
        address payer,
        bytes32 positionId,
        uint256 principalAdded,
        uint256 amountLent
    )
        internal
    {
        // Assume lender approval if not a smart contract and they increased their own loan
        if (payer == contractAddr && !AddressUtils.isContract(contractAddr)) {
            return;
        }

        address newContractAddr =
            IncreaseLoanDelegator(contractAddr).increaseLoanOnBehalfOf(
                payer,
                positionId,
                principalAdded,
                amountLent
            );

        if (newContractAddr != contractAddr) {
            increaseLoanOnBehalfOfRecurse(
                newContractAddr,
                payer,
                positionId,
                principalAdded,
                amountLent
            );
        }
    }

    function recordPositionIncreased(
        BorrowShared.Tx transaction,
        MarginCommon.Position storage position
    )
        internal
    {
        emit PositionIncreased(
            transaction.positionId,
            msg.sender,
            transaction.loanOffering.payer,
            position.owner,
            position.lender,
            transaction.loanOffering.loanHash,
            transaction.loanOffering.feeRecipient,
            transaction.lenderAmount,
            transaction.principal,
            transaction.heldTokenFromSell,
            transaction.depositAmount,
            transaction.depositInHeldToken
        );
    }

    // ============ Parsing Functions ============

    function parseIncreasePositionTx(
        MarginCommon.Position storage position,
        bytes32 positionId,
        address[8] addresses,
        uint256[8] values256,
        uint32[2] values32,
        uint8 sigV,
        bytes32[2] sigRS,
        bool depositInHeldToken
    )
        internal
        view
        returns (BorrowShared.Tx memory)
    {
        uint256 principal = values256[7];

        BorrowShared.Tx memory transaction = BorrowShared.Tx({
            positionId: positionId,
            owner: position.owner,
            principal: principal,
            lenderAmount: MarginCommon.calculateLenderAmountForIncreasePosition(
                position,
                principal,
                block.timestamp
            ),
            loanOffering: parseLoanOfferingFromIncreasePositionTx(
                position,
                addresses,
                values256,
                values32,
                sigV,
                sigRS
            ),
            exchangeWrapper: addresses[7],
            depositInHeldToken: depositInHeldToken,
            depositAmount: 0, // set later
            collateralAmount: 0, // set later
            heldTokenFromSell: 0 // set later
        });

        return transaction;
    }

    function parseLoanOfferingFromIncreasePositionTx(
        MarginCommon.Position storage position,
        address[8] addresses,
        uint256[8] values256,
        uint32[2] values32,
        uint8 sigV,
        bytes32[2] sigRS
    )
        internal
        view
        returns (MarginCommon.LoanOffering memory)
    {
        MarginCommon.LoanOffering memory loanOffering = MarginCommon.LoanOffering({
            owedToken: position.owedToken,
            heldToken: position.heldToken,
            payer: addresses[0],
            signer: addresses[1],
            owner: position.lender,
            taker: addresses[2],
            takerOwner: addresses[3],
            feeRecipient: addresses[4],
            lenderFeeToken: addresses[5],
            takerFeeToken: addresses[6],
            rates: parseLoanOfferingRatesFromIncreasePositionTx(position, values256),
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

    function parseLoanOfferingRatesFromIncreasePositionTx(
        MarginCommon.Position storage position,
        uint256[8] values256
    )
        internal
        view
        returns (MarginCommon.LoanRates memory)
    {
        MarginCommon.LoanRates memory rates = MarginCommon.LoanRates({
            maxAmount: values256[0],
            minAmount: values256[1],
            minHeldToken: values256[2],
            interestRate: position.interestRate,
            lenderFee: values256[3],
            takerFee: values256[4],
            interestPeriod: position.interestPeriod
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
