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

import { AddressUtils } from "openzeppelin-solidity/contracts/AddressUtils.sol";
import { Math } from "openzeppelin-solidity/contracts/math/Math.sol";
import { SafeMath } from "openzeppelin-solidity/contracts/math/SafeMath.sol";
import { MarginCommon } from "./MarginCommon.sol";
import { MarginState } from "./MarginState.sol";
import { TokenProxy } from "../TokenProxy.sol";
import { Vault } from "../Vault.sol";
import { MathHelpers } from "../../lib/MathHelpers.sol";
import { TypedSignature } from "../../lib/TypedSignature.sol";
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

    /**
     * Validate the transaction before exchanging heldToken for owedToken
     */
    function validateTxPreSell(
        MarginState.State storage state,
        Tx memory transaction
    )
        internal
    {
        assert(transaction.lenderAmount >= transaction.principal);

        require(
            transaction.principal > 0,
            "BorrowShared#validateTxPreSell: Positions with 0 principal are not allowed"
        );

        // If the taker is 0x0 then any address can take it. Otherwise only the taker can use it.
        if (transaction.loanOffering.taker != address(0)) {
            require(
                msg.sender == transaction.loanOffering.taker,
                "BorrowShared#validateTxPreSell: Invalid loan offering taker"
            );
        }

        // If the positionOwner is 0x0 then any address can be set as the position owner.
        // Otherwise only the specified positionOwner can be set as the position owner.
        if (transaction.loanOffering.positionOwner != address(0)) {
            require(
                transaction.owner == transaction.loanOffering.positionOwner,
                "BorrowShared#validateTxPreSell: Invalid position owner"
            );
        }

        // Require the loan offering to be approved by the payer
        if (AddressUtils.isContract(transaction.loanOffering.payer)) {
            getConsentFromSmartContractLender(transaction);
        } else {
            require(
                transaction.loanOffering.payer == TypedSignature.recover(
                    transaction.loanOffering.loanHash,
                    transaction.loanOffering.signature
                ),
                "BorrowShared#validateTxPreSell: Invalid loan offering signature"
            );
        }

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

    /**
     * Validate the transaction after exchanging heldToken for owedToken, pay out fees, and store
     * how much of the loan was used.
     */
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

    /**
     * Sells the owedToken from the lender (and from the deposit if in owedToken) using the
     * exchangeWrapper, then puts the resulting heldToken into the vault. Only trades for
     * maxHeldTokenToBuy of heldTokens at most.
     */
    function doSell(
        MarginState.State storage state,
        Tx transaction,
        bytes orderData,
        uint256 maxHeldTokenToBuy
    )
        internal
        returns (uint256)
    {
        // Move owedTokens from lender to exchange wrapper
        pullOwedTokensFromLender(state, transaction);

        // Sell just the lender's owedToken (if trader deposit is in heldToken)
        // Otherwise sell both the lender's owedToken and the trader's deposit in owedToken
        uint256 sellAmount = transaction.depositInHeldToken ?
            transaction.lenderAmount :
            transaction.lenderAmount.add(transaction.depositAmount);

        // Do the trade, taking only the maxHeldTokenToBuy if more is returned
        uint256 heldTokenFromSell = Math.min256(
            maxHeldTokenToBuy,
            ExchangeWrapper(transaction.exchangeWrapper).exchange(
                msg.sender,
                state.TOKEN_PROXY,
                transaction.loanOffering.heldToken,
                transaction.loanOffering.owedToken,
                sellAmount,
                orderData
            )
        );

        // Move the tokens to the vault
        Vault(state.VAULT).transferToVault(
            transaction.positionId,
            transaction.loanOffering.heldToken,
            transaction.exchangeWrapper,
            heldTokenFromSell
        );

        // Update collateral amount
        transaction.collateralAmount = transaction.collateralAmount.add(heldTokenFromSell);

        return heldTokenFromSell;
    }

    /**
     * Take the owedToken deposit from the trader and give it to the exchange wrapper so that it can
     * be sold for heldToken.
     */
    function doDepositOwedToken(
        MarginState.State storage state,
        Tx transaction
    )
        internal
    {
        TokenProxy(state.TOKEN_PROXY).transferTokens(
            transaction.loanOffering.owedToken,
            msg.sender,
            transaction.exchangeWrapper,
            transaction.depositAmount
        );
    }

    /**
     * Take the heldToken deposit from the trader and move it to the vault.
     */
    function doDepositHeldToken(
        MarginState.State storage state,
        Tx transaction
    )
        internal
    {
        Vault(state.VAULT).transferToVault(
            transaction.positionId,
            transaction.loanOffering.heldToken,
            msg.sender,
            transaction.depositAmount
        );

        // Update collateral amount
        transaction.collateralAmount = transaction.collateralAmount.add(transaction.depositAmount);
    }

    // ============ Private Helper-Functions ============

    function validateTxPostSell(
        Tx transaction
    )
        private
        pure
    {
        uint256 expectedCollateral = transaction.depositInHeldToken ?
            transaction.heldTokenFromSell.add(transaction.depositAmount) :
            transaction.heldTokenFromSell;
        assert(transaction.collateralAmount == expectedCollateral);

        uint256 loanOfferingMinimumHeldToken = MathHelpers.getPartialAmountRoundedUp(
            transaction.lenderAmount,
            transaction.loanOffering.rates.maxAmount,
            transaction.loanOffering.rates.minHeldToken
        );
        require(
            transaction.collateralAmount >= loanOfferingMinimumHeldToken,
            "BorrowShared#validateTxPostSell: Loan offering minimum held token not met"
        );
    }

    function getConsentFromSmartContractLender(
        Tx transaction
    )
        private
    {
        verifyLoanOfferingRecurse(
            transaction.loanOffering.payer,
            getLoanOfferingAddresses(transaction),
            getLoanOfferingValues256(transaction),
            getLoanOfferingValues32(transaction),
            transaction.positionId,
            transaction.loanOffering.signature
        );
    }

    function verifyLoanOfferingRecurse(
        address contractAddr,
        address[9] addresses,
        uint256[7] values256,
        uint32[4] values32,
        bytes32 positionId,
        bytes signature
    )
        private
    {
        address newContractAddr = LoanOfferingVerifier(contractAddr).verifyLoanOffering(
            addresses,
            values256,
            values32,
            positionId,
            signature
        );

        if (newContractAddr != contractAddr) {
            verifyLoanOfferingRecurse(
                newContractAddr,
                addresses,
                values256,
                values32,
                positionId,
                signature
            );
        }
    }

    function pullOwedTokensFromLender(
        MarginState.State storage state,
        Tx transaction
    )
        private
    {
        // Transfer owedToken to the exchange wrapper
        TokenProxy(state.TOKEN_PROXY).transferTokens(
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
        private
    {
        // 0 fee address indicates no fees
        if (transaction.loanOffering.feeRecipient == address(0)) {
            return;
        }

        TokenProxy proxy = TokenProxy(state.TOKEN_PROXY);

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

    function getLoanOfferingAddresses(
        Tx transaction
    )
        private
        pure
        returns (address[9])
    {
        return [
            transaction.loanOffering.owedToken,
            transaction.loanOffering.heldToken,
            transaction.loanOffering.payer,
            transaction.loanOffering.owner,
            transaction.loanOffering.taker,
            transaction.loanOffering.positionOwner,
            transaction.loanOffering.feeRecipient,
            transaction.loanOffering.lenderFeeToken,
            transaction.loanOffering.takerFeeToken
        ];
    }

    function getLoanOfferingValues256(
        Tx transaction
    )
        private
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
        private
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
