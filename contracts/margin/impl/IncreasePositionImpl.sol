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
        address[7] addresses,
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

        uint256 heldTokenFromSell = preStateUpdate(
            state,
            transaction,
            position,
            orderData
        );

        updateState(
            position,
            transaction.positionId,
            transaction.principal,
            transaction.lenderAmount,
            transaction.loanOffering.payer
        );

        // LOG EVENT
        recordPositionIncreased(
            transaction,
            position,
            heldTokenFromSell
        );

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

        uint256 heldTokenAmount = getPositionMinimumHeldToken(
            positionId,
            state,
            principalToAdd,
            position
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

    function preStateUpdate(
        MarginState.State storage state,
        BorrowShared.Tx transaction,
        MarginCommon.Position storage position,
        bytes orderData
    )
        internal
        returns (uint256 /* heldTokenFromSell */)
    {
        validate(transaction, position);

        uint256 positionMinimumHeldToken = setDepositAmount(
            state,
            transaction,
            position,
            orderData
        );

        (
            uint256 heldTokenFromSell,
            uint256 totalHeldTokenReceived
        ) = BorrowShared.doBorrowAndSell(
            state,
            transaction,
            orderData
        );

        // This should always be true unless there is a faulty ExchangeWrapper (i.e. the
        // ExchangeWrapper traded at a different price from what it said it would)
        assert(positionMinimumHeldToken == totalHeldTokenReceived);

        return heldTokenFromSell;
    }

    function validate(
        BorrowShared.Tx transaction,
        MarginCommon.Position storage position
    )
        internal
        view
    {
        require(
            position.callTimeLimit <= transaction.loanOffering.callTimeLimit,
            "IncreasePositionImpl#validate: Loan offering must have >= position callTimeLimit"
        );

        // require the position to end no later than the loanOffering's maximum acceptable end time
        uint256 positionEndTimestamp = uint256(position.startTimestamp).add(position.maxDuration);
        uint256 offeringEndTimestamp = block.timestamp.add(transaction.loanOffering.maxDuration);
        require(
            positionEndTimestamp <= offeringEndTimestamp,
            "IncreasePositionImpl#validate: Loan offering must have >= position end timestamp"
        );

        require(
            block.timestamp < positionEndTimestamp,
            "IncreasePositionImpl#validate: Cannot increase position after its maximum duration"
        );
    }

    function setDepositAmount(
        MarginState.State storage state,
        BorrowShared.Tx transaction,
        MarginCommon.Position storage position,
        bytes orderData
    )
        internal
        view // Does modify transaction
        returns (uint256 /* positionMinimumHeldToken */)
    {
        // Amount of heldToken we need to add to the position to maintain the position's ratio
        // of heldToken to owedToken
        uint256 positionMinimumHeldToken = getPositionMinimumHeldToken(
            transaction.positionId,
            state,
            transaction.principal,
            position
        );

        if (transaction.depositInHeldToken) {
            uint256 heldTokenFromSell = ExchangeWrapper(transaction.exchangeWrapper)
                .getTradeMakerTokenAmount(
                    transaction.loanOffering.heldToken,
                    transaction.loanOffering.owedToken,
                    transaction.lenderAmount,
                    orderData
                );

            require(
                heldTokenFromSell <= positionMinimumHeldToken,
                "IncreasePositionImpl#setDepositAmount: DEX Order gives too much heldToken"
            );
            transaction.depositAmount = positionMinimumHeldToken.sub(heldTokenFromSell);
        } else {
            uint256 owedTokenToSell = ExchangeWrapper(transaction.exchangeWrapper)
                .getTakerTokenPrice(
                    transaction.loanOffering.heldToken,
                    transaction.loanOffering.owedToken,
                    positionMinimumHeldToken,
                    orderData
                );

            require(
                transaction.lenderAmount <= owedTokenToSell,
                "IncreasePositionImpl#setDepositAmount: Cannot sell borrowed owedToken with order"
            );
            transaction.depositAmount = owedTokenToSell.sub(transaction.lenderAmount);
            transaction.desiredTokenFromSell = positionMinimumHeldToken;
        }

        return positionMinimumHeldToken;
    }

    function getPositionMinimumHeldToken(
        bytes32 positionId,
        MarginState.State storage state,
        uint256 principalAdded,
        MarginCommon.Position storage position
    )
        internal
        view
        returns (uint256)
    {
        uint256 heldTokenBalance = Vault(state.VAULT).balances(
            positionId, position.heldToken);

        return MathHelpers.getPartialAmountRoundedUp(
            principalAdded,
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
        MarginCommon.Position storage position,
        uint256 heldTokenFromSell
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
            heldTokenFromSell,
            transaction.depositAmount,
            transaction.depositInHeldToken
        );
    }

    // ============ Parsing Functions ============

    function parseIncreasePositionTx(
        MarginCommon.Position storage position,
        bytes32 positionId,
        address[7] addresses,
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
        BorrowShared.Tx memory transaction = BorrowShared.Tx({
            positionId: positionId,
            owner: position.owner,
            principal: values256[7],
            lenderAmount: MarginCommon.calculateLenderAmountForIncreasePosition(
                position,
                values256[7],
                block.timestamp
            ),
            depositAmount: 0,
            loanOffering: parseLoanOfferingFromIncreasePositionTx(
                position,
                addresses,
                values256,
                values32,
                sigV,
                sigRS
            ),
            exchangeWrapper: addresses[6],
            depositInHeldToken: depositInHeldToken,
            desiredTokenFromSell: 0
        });

        return transaction;
    }

    function parseLoanOfferingFromIncreasePositionTx(
        MarginCommon.Position storage position,
        address[7] addresses,
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
            feeRecipient: addresses[3],
            lenderFeeToken: addresses[4],
            takerFeeToken: addresses[5],
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
