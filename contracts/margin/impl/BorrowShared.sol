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
import { MarginCommon } from "./MarginCommon.sol";
import { MarginState } from "./MarginState.sol";
import { Proxy } from "../Proxy.sol";
import { Vault } from "../Vault.sol";
import { MathHelpers } from "../../lib/MathHelpers.sol";
import { ExchangeWrapper } from "../interfaces/ExchangeWrapper.sol";
import { LoanOfferingVerifier } from "../interfaces/LoanOfferingVerifier.sol";


/**
 * @title BorrowShared
 * @author dYdX
 *
 * This library contains shared functionality between OpenPositionImpl and IncreasePositionImpl.
 * Both use a Loan Offering and a DEX Order to open or increase a position.
 */
library BorrowShared {
    using SafeMath for uint256;

    // ============ Structs ============

    struct Tx {
        bytes32 positionId;
        address owner;
        uint256 principal;
        uint256 lenderAmount;
        MarginCommon.LoanOffering loanOffering;
        address exchangeWrapper;
        bool depositInHeldToken;
        uint256 depositAmount;
        uint256 collateralAmount;
        uint256 heldTokenFromSell;
    }

    // ============ Internal Implementation Functions ============

    function doPreSell(
        MarginState.State storage state,
        Tx memory transaction
    )
        internal
    {
        validateTxPreSell(
            state,
            transaction
        );

        getConsentIfSmartContractLender(transaction);

        pullOwedTokensFromLender(state, transaction);
    }

    function doPostSell(
        MarginState.State storage state,
        Tx memory transaction
    )
        internal
    {
        validateTxPostSell(transaction);

        // Transfer feeTokens from trader and lender
        transferLoanFees(state, transaction);

        // Update global amounts for the loan
        state.loanFills[transaction.loanOffering.loanHash] =
            state.loanFills[transaction.loanOffering.loanHash].add(transaction.lenderAmount);
    }

    function doSell(
        MarginState.State storage state,
        Tx transaction,
        bytes orderData
    )
        internal
        returns (uint256)
    {
        uint256 sellAmount = transaction.depositInHeldToken ?
            transaction.lenderAmount :
            transaction.lenderAmount.add(transaction.depositAmount);

        // Do the trade and transfer heldToken to Vault
        uint256 heldTokenFromSell = ExchangeWrapper(transaction.exchangeWrapper).exchange(
            transaction.loanOffering.heldToken,
            transaction.loanOffering.owedToken,
            msg.sender,
            sellAmount,
            orderData
        );
        Vault(state.VAULT).transferToVault(
            transaction.positionId,
            transaction.loanOffering.heldToken,
            transaction.exchangeWrapper,
            heldTokenFromSell
        );

        return heldTokenFromSell;
    }

    function validateTxPreSell(
        MarginState.State storage state,
        Tx transaction
    )
        internal
        view
    {
        assert(transaction.lenderAmount >= transaction.principal);

        require(
            transaction.principal > 0,
            "BorrowShared#validateTxPreSell: Positions with 0 principal are not allowed"
        );

        // If the taker is 0x000... then anyone can take it. Otherwise only the taker can use it
        if (transaction.loanOffering.taker != address(0)) {
            require(
                msg.sender == transaction.loanOffering.taker,
                "BorrowShared#validateTxPreSell: Invalid loan offering taker"
            );
        }

        // Require the order to either have a valid signature or be pre-approved on-chain
        require(
            isValidSignature(transaction.loanOffering)
            || state.approvedLoans[transaction.loanOffering.loanHash],
            "BorrowShared#validateTxPreSell: Invalid loan offering signature"
        );

        // Validate the amount is <= than max and >= min
        uint256 unavailable = MarginCommon.getUnavailableLoanOfferingAmountImpl(
            state,
            transaction.loanOffering.loanHash
        );
        require(
            transaction.lenderAmount.add(unavailable) <= transaction.loanOffering.rates.maxAmount,
            "BorrowShared#validateTxPreSell: Loan offering does not have enough available"
        );

        require(
            transaction.lenderAmount >= transaction.loanOffering.rates.minAmount,
            "BorrowShared#validateTxPreSell: Lender amount is below loan offering minimum amount"
        );

        require(
            transaction.loanOffering.owedToken != transaction.loanOffering.heldToken,
            "BorrowShared#validateTxPreSell: owedToken cannot be equal to heldToken"
        );

        require(
            transaction.owner != address(0),
            "BorrowShared#validateTxPreSell: Position owner cannot be 0"
        );

        require(
            transaction.loanOffering.owner != address(0),
            "BorrowShared#validateTxPreSell: Loan owner cannot be 0"
        );

        require(
            transaction.loanOffering.expirationTimestamp > block.timestamp,
            "BorrowShared#validateTxPreSell: Loan offering is expired"
        );

        require(
            transaction.loanOffering.maxDuration > 0,
            "BorrowShared#validateTxPreSell: Loan offering has 0 maximum duration"
        );

        require(
            transaction.loanOffering.rates.interestPeriod <= transaction.loanOffering.maxDuration,
            "BorrowShared#validateTxPreSell: Loan offering interestPeriod > maxDuration"
        );

        // The minimum heldToken is validated after executing the sell
        // Position and loan ownership is validated in TransferInternal
    }

    function validateTxPostSell(
        Tx transaction
    )
        internal
        pure
    {
        uint256 heldTokenAsCollateral = transaction.depositInHeldToken ?
            transaction.heldTokenFromSell.add(transaction.depositAmount) :
            transaction.heldTokenFromSell;

        uint256 loanOfferingMinimumHeldToken = MathHelpers.getPartialAmountRoundedUp(
            transaction.lenderAmount,
            transaction.loanOffering.rates.maxAmount,
            transaction.loanOffering.rates.minHeldToken
        );

        require(
            heldTokenAsCollateral >= loanOfferingMinimumHeldToken,
            "BorrowShared#validateTxPostSell: Loan offering minimum held token not met"
        );
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
            keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", loanOffering.loanHash)),
            loanOffering.signature.v,
            loanOffering.signature.r,
            loanOffering.signature.s
        );

        return loanOffering.signer == recoveredSigner;
    }

    function getConsentIfSmartContractLender(
        Tx transaction
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
                transaction.positionId
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
        Tx transaction
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

    function transferLoanFees(
        MarginState.State storage state,
        Tx transaction
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

    function doDepositOwedToken(
        MarginState.State storage state,
        Tx transaction
    )
        internal
        returns (uint256)
    {
        Proxy(state.PROXY).transferTokens(
            transaction.loanOffering.owedToken,
            msg.sender,
            transaction.exchangeWrapper,
            transaction.depositAmount
        );
    }

    function doDepositHeldToken(
        MarginState.State storage state,
        Tx transaction
    )
        internal
        returns (uint256)
    {
        Vault(state.VAULT).transferToVault(
            transaction.positionId,
            transaction.loanOffering.heldToken,
            msg.sender,
            transaction.depositAmount
        );
    }

    function getLoanOfferingAddresses(
        Tx transaction
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
        Tx transaction
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
        Tx transaction
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
