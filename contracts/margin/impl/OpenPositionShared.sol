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
import { Proxy } from "../Proxy.sol";
import { Vault } from "../Vault.sol";
import { MathHelpers } from "../../lib/MathHelpers.sol";
import { ExchangeWrapper } from "../interfaces/ExchangeWrapper.sol";
import { LoanOfferingVerifier } from "../interfaces/LoanOfferingVerifier.sol";


/**
 * @title OpenPositionShared
 * @author dYdX
 *
 * This library contains shared functionality between OpenPositionImpl and IncreasePositionImpl
 */
library OpenPositionShared {
    using SafeMath for uint256;

    // ============ Structs ============

    struct OpenTx {
        address owner;
        uint256 principal;
        uint256 lenderAmount;
        uint256 depositAmount;
        MarginCommon.LoanOffering loanOffering;
        address exchangeWrapper;
        bool depositInHeldToken;
        uint256 desiredTokenFromSell;
    }

    // ============ Internal Implementation Functions ============

    function openPositionInternalPreStateUpdate(
        MarginState.State storage state,
        OpenTx memory transaction,
        bytes32 positionId,
        bytes orderData
    )
        internal
        returns (uint256, uint256)
    {
        validateOpenTx(
            state,
            transaction
        );

        getConsentIfSmartContractLender(transaction, positionId);

        pullOwedTokensFromLender(state, transaction);

        // Pull deposit from the msg.sender
        uint256 heldTokenFromDeposit = transferDeposit(state, transaction, positionId);

        uint256 sellAmount = transaction.depositInHeldToken ? transaction.lenderAmount
            : transaction.lenderAmount.add(transaction.depositAmount);

        uint256 heldTokenFromSell = executeSell(
            state,
            transaction,
            orderData,
            positionId,
            sellAmount
        );

        uint256 totalHeldTokenReceived = heldTokenFromDeposit.add(heldTokenFromSell);
        validateMinimumHeldToken(
            transaction,
            totalHeldTokenReceived
        );

        // Transfer feeTokens from trader and lender
        transferLoanFees(state, transaction);

        // Update global amounts for the loan
        state.loanFills[transaction.loanOffering.loanHash] =
            state.loanFills[transaction.loanOffering.loanHash].add(transaction.lenderAmount);

        return (
            heldTokenFromSell,
            totalHeldTokenReceived
        );
    }

    function validateOpenTx(
        MarginState.State storage state,
        OpenTx transaction
    )
        internal
        view
    {
        assert(transaction.lenderAmount >= transaction.principal);

        require(
            transaction.principal > 0,
            "OpenPositionShared#validateOpenTx: Positions with 0 principal are not allowed"
        );

        // If the taker is 0x000... then anyone can take it. Otherwise only the taker can use it
        if (transaction.loanOffering.taker != address(0)) {
            require(
                msg.sender == transaction.loanOffering.taker,
                "OpenPositionShared#validateOpenTx: Invalid loan offering taker"
            );
        }

        // Require the order to either have a valid signature or be pre-approved on-chain
        require(
            isValidSignature(transaction.loanOffering)
            || state.approvedLoans[transaction.loanOffering.loanHash],
            "OpenPositionShared#validateOpenTx: Invalid loan offering signature"
        );

        // Validate the amount is <= than max and >= min
        require(
            transaction.lenderAmount.add(
                MarginCommon.getUnavailableLoanOfferingAmountImpl(
                    state,
                    transaction.loanOffering.loanHash
                )
            ) <= transaction.loanOffering.rates.maxAmount,
            "OpenPositionShared#validateOpenTx: Loan offering does not have enough available"
        );

        require(
            transaction.loanOffering.owedToken != transaction.loanOffering.heldToken,
            "OpenPositionShared#validateOpenTx: owedToken cannot be equal to heldToken"
        );

        require(
            transaction.lenderAmount >= transaction.loanOffering.rates.minAmount,
            "OpenPositionShared#validateOpenTx: Below loan offering minimum amount"
        );

        require(
            transaction.loanOffering.expirationTimestamp > block.timestamp,
            "OpenPositionShared#validateOpenTx: Loan offering is expired"
        );

        require(
            transaction.loanOffering.maxDuration > 0,
            "OpenPositionShared#validateOpenTx: Loan offering has 0 maximum duration"
        );

        require(
            transaction.loanOffering.rates.interestPeriod <= transaction.loanOffering.maxDuration,
            "OpenPositionShared#validateOpenTx: Loan offering interestPeriod > maxDuration"
        );

        // The minimum heldToken is validated after executing the sell
        // Position and loan ownership is validated in TransferInternal
    }

    function isValidSignature(
        MarginCommon.LoanOffering loanOffering
    )
        internal
        pure
        returns (bool)
    {
        if (loanOffering.signature.v == 0
            && loanOffering.signature.r == ""
            && loanOffering.signature.s == ""
        ) {
            return false;
        }

        address recoveredSigner = ecrecover(
            keccak256("\x19Ethereum Signed Message:\n32", loanOffering.loanHash),
            loanOffering.signature.v,
            loanOffering.signature.r,
            loanOffering.signature.s
        );

        return loanOffering.signer == recoveredSigner;
    }

    function getConsentIfSmartContractLender(
        OpenTx transaction,
        bytes32 positionId
    )
        internal
    {
        // If the signer != payer, assume payer is a smart contract and ask it for consent
        if (transaction.loanOffering.signer != transaction.loanOffering.payer) {
            verifyLoanOfferingRecurse(
                transaction.loanOffering.payer,
                getLoanOfferingAddresses(transaction),
                getLoanOfferingValues256(transaction),
                getLoanOfferingValues32(transaction),
                positionId
            );
        }
    }

    function verifyLoanOfferingRecurse(
        address contractAddr,
        address[9] addresses,
        uint256[7] values256,
        uint32[4] values32,
        bytes32 positionId
    )
        internal
    {
        address newContractAddr = LoanOfferingVerifier(contractAddr).verifyLoanOffering(
            addresses,
            values256,
            values32,
            positionId
        );

        if (newContractAddr != contractAddr) {
            verifyLoanOfferingRecurse(
                newContractAddr,
                addresses,
                values256,
                values32,
                positionId
            );
        }
    }

    function pullOwedTokensFromLender(
        MarginState.State storage state,
        OpenTx transaction
    )
        internal
    {
        // Transfer owedToken to the exchange wrapper
        Proxy(state.PROXY).transferTokens(
            transaction.loanOffering.owedToken,
            transaction.loanOffering.payer,
            transaction.exchangeWrapper,
            transaction.lenderAmount
        );
    }

    function transferDeposit(
        MarginState.State storage state,
        OpenTx transaction,
        bytes32 positionId
    )
        internal
        returns (uint256 /* heldTokenFromDeposit */)
    {
        if (transaction.depositInHeldToken) {
            Vault(state.VAULT).transferToVault(
                positionId,
                transaction.loanOffering.heldToken,
                msg.sender,
                transaction.depositAmount
            );
            return transaction.depositAmount;
        } else {
            Proxy(state.PROXY).transferTokens(
                transaction.loanOffering.owedToken,
                msg.sender,
                transaction.exchangeWrapper,
                transaction.depositAmount
            );
            return 0;
        }
    }

    function transferLoanFees(
        MarginState.State storage state,
        OpenTx transaction
    )
        internal
    {
        // 0 fee address indicates no fees
        if (transaction.loanOffering.feeRecipient == address(0)) {
            return;
        }

        Proxy proxy = Proxy(state.PROXY);

        uint256 lenderFee = MathHelpers.getPartialAmount(
            transaction.lenderAmount,
            transaction.loanOffering.rates.maxAmount,
            transaction.loanOffering.rates.lenderFee
        );
        uint256 takerFee = MathHelpers.getPartialAmount(
            transaction.lenderAmount,
            transaction.loanOffering.rates.maxAmount,
            transaction.loanOffering.rates.takerFee
        );

        if (lenderFee > 0) {
            proxy.transferTokens(
                transaction.loanOffering.lenderFeeToken,
                transaction.loanOffering.payer,
                transaction.loanOffering.feeRecipient,
                lenderFee
            );
        }

        if (takerFee > 0) {
            proxy.transferTokens(
                transaction.loanOffering.takerFeeToken,
                msg.sender,
                transaction.loanOffering.feeRecipient,
                takerFee
            );
        }
    }

    function executeSell(
        MarginState.State storage state,
        OpenTx transaction,
        bytes orderData,
        bytes32 positionId,
        uint256 sellAmount
    )
        internal
        returns (uint256)
    {
        uint256 heldTokenReceived;
        if (transaction.desiredTokenFromSell == 0) {
            heldTokenReceived = ExchangeWrapper(transaction.exchangeWrapper).exchange(
                transaction.loanOffering.heldToken,
                transaction.loanOffering.owedToken,
                msg.sender,
                sellAmount,
                orderData
            );
        } else {
            uint256 soldAmount = ExchangeWrapper(transaction.exchangeWrapper).exchangeForAmount(
                transaction.loanOffering.heldToken,
                transaction.loanOffering.owedToken,
                msg.sender,
                transaction.desiredTokenFromSell,
                orderData
            );

            assert(soldAmount == sellAmount);
            heldTokenReceived = transaction.desiredTokenFromSell;
        }

        Vault(state.VAULT).transferToVault(
            positionId,
            transaction.loanOffering.heldToken,
            transaction.exchangeWrapper,
            heldTokenReceived
        );

        return heldTokenReceived;
    }

    function validateMinimumHeldToken(
        OpenTx transaction,
        uint256 totalHeldTokenReceived
    )
        internal
        pure
    {
        uint256 loanOfferingMinimumHeldToken = MathHelpers.getPartialAmountRoundedUp(
            transaction.lenderAmount,
            transaction.loanOffering.rates.maxAmount,
            transaction.loanOffering.rates.minHeldToken
        );

        require(
            totalHeldTokenReceived >= loanOfferingMinimumHeldToken,
            "OpenPositionShared#validateMinimumHeldToken: Loan offering minimum held token not met"
        );
    }

    function getLoanOfferingAddresses(
        OpenTx transaction
    )
        internal
        pure
        returns (address[9])
    {
        return [
            transaction.loanOffering.owedToken,
            transaction.loanOffering.heldToken,
            transaction.loanOffering.payer,
            transaction.loanOffering.signer,
            transaction.loanOffering.owner,
            transaction.loanOffering.taker,
            transaction.loanOffering.feeRecipient,
            transaction.loanOffering.lenderFeeToken,
            transaction.loanOffering.takerFeeToken
        ];
    }

    function getLoanOfferingValues256(
        OpenTx transaction
    )
        internal
        pure
        returns (uint256[7])
    {
        return [
            transaction.loanOffering.rates.maxAmount,
            transaction.loanOffering.rates.minAmount,
            transaction.loanOffering.rates.minHeldToken,
            transaction.loanOffering.rates.lenderFee,
            transaction.loanOffering.rates.takerFee,
            transaction.loanOffering.expirationTimestamp,
            transaction.loanOffering.salt
        ];
    }

    function getLoanOfferingValues32(
        OpenTx transaction
    )
        internal
        pure
        returns (uint32[4])
    {
        return [
            transaction.loanOffering.callTimeLimit,
            transaction.loanOffering.maxDuration,
            transaction.loanOffering.rates.interestRate,
            transaction.loanOffering.rates.interestPeriod
        ];
    }
}
