pragma solidity 0.4.21;
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
        address baseToken;
        address quoteToken;
        uint256 principal;
        uint256 lenderAmount;
        uint256 depositAmount;
        MarginCommon.LoanOffering loanOffering;
        address exchangeWrapper;
        bool depositInQuoteToken;
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
        // Validate
        validateOpenTx(
            state,
            transaction
        );

        // First pull funds from lender and sell them. Prefer to do this first to make order
        // collisions use up less gas.
        // NOTE: Doing this before updating state relies on #openPosition being non-reentrant
        transferFromLender(state, transaction);

        // Transfer deposit from the msg.sender
        uint256 quoteTokenFromDeposit = transferDeposit(state, transaction, positionId);

        uint256 sellAmount = transaction.depositInQuoteToken ? transaction.lenderAmount
            : transaction.lenderAmount.add(transaction.depositAmount);

        uint256 quoteTokenFromSell = executeSell(
            state,
            transaction,
            orderData,
            positionId,
            sellAmount
        );

        uint256 totalQuoteTokenReceived = quoteTokenFromDeposit.add(quoteTokenFromSell);
        validateMinimumQuoteToken(
            transaction,
            totalQuoteTokenReceived
        );

        return (
            quoteTokenFromSell,
            totalQuoteTokenReceived
        );
    }

    function openPositionInternalPostStateUpdate(
        MarginState.State storage state,
        OpenTx memory transaction,
        bytes32 positionId
    )
        internal
    {
        // If the lender is a smart contract, call out to it to get its consent for this loan
        // This is done after other validations/state updates as it is an external call
        // NOTE: The position will exist in the Repo for this call
        //       (possible other contract calls back into Margin)
        getConsentIfSmartContractLender(transaction, positionId);

        transferLoanFees(
            state,
            transaction
        );
    }

    function validateOpenTx(
        MarginState.State storage state,
        OpenTx transaction
    )
        internal
        view
    {
        // Disallow positions with zero amount
        require(transaction.principal > 0);

        // If the taker is 0x000... then anyone can take it. Otherwise only the taker can use it
        if (transaction.loanOffering.taker != address(0)) {
            require(msg.sender == transaction.loanOffering.taker);
        }

        // Require the order to either have a valid signature or be pre-approved on-chain
        require(
            isValidSignature(transaction.loanOffering)
            || state.approvedLoans[transaction.loanOffering.loanHash]
        );

        // Validate the position amount is <= than max and >= min
        require(
            transaction.principal.add(
                MarginCommon.getUnavailableLoanOfferingAmountImpl(
                    state,
                    transaction.loanOffering.loanHash
                )
            ) <= transaction.loanOffering.rates.maxAmount
        );
        require(transaction.principal >= transaction.loanOffering.rates.minAmount);
        require(transaction.loanOffering.expirationTimestamp > block.timestamp);

        // Check no casting errors
        require(
            uint256(uint32(block.timestamp)) == block.timestamp
        );

        // Disallow zero address owners
        require(transaction.owner != address(0));
        require(transaction.loanOffering.owner != address(0));

        // The interest rounding period cannot be longer than max duration
        require(
            transaction.loanOffering.rates.interestPeriod <= transaction.loanOffering.maxDuration
        );

        // The minimum quote token is validated after executing the sell
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
        // If the signer != payer, get consent from payer
        if (transaction.loanOffering.signer != transaction.loanOffering.payer) {
            require(
                LoanOfferingVerifier(transaction.loanOffering.payer).verifyLoanOffering(
                    getLoanOfferingAddresses(transaction),
                    getLoanOfferingValues256(transaction),
                    getLoanOfferingValues32(transaction),
                    positionId
                )
            );
        }
    }

    function transferFromLender(
        MarginState.State storage state,
        OpenTx transaction
    )
        internal
    {
        // Transfer base token to the exchange wrapper
        Proxy(state.PROXY).transferTokens(
            transaction.baseToken,
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
        returns (uint256 /* quoteTokenFromDeposit */)
    {
        if (transaction.depositAmount > 0) {
            if (transaction.depositInQuoteToken) {
                Vault(state.VAULT).transferToVault(
                    positionId,
                    transaction.quoteToken,
                    msg.sender,
                    transaction.depositAmount
                );
                return transaction.depositAmount;
            } else {
                Proxy(state.PROXY).transferTokens(
                    transaction.baseToken,
                    msg.sender,
                    transaction.exchangeWrapper,
                    transaction.depositAmount
                );
                return 0;
            }
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
        uint256 quoteTokenReceived;
        if (transaction.desiredTokenFromSell == 0) {
            quoteTokenReceived = ExchangeWrapper(transaction.exchangeWrapper).exchange(
                transaction.quoteToken,
                transaction.baseToken,
                msg.sender,
                sellAmount,
                orderData
            );
        } else {
            uint256 soldAmount = ExchangeWrapper(transaction.exchangeWrapper).exchangeForAmount(
                transaction.quoteToken,
                transaction.baseToken,
                msg.sender,
                transaction.desiredTokenFromSell,
                orderData
            );

            assert(soldAmount == sellAmount);
            quoteTokenReceived = transaction.desiredTokenFromSell;
        }

        Vault(state.VAULT).transferToVault(
            positionId,
            transaction.quoteToken,
            transaction.exchangeWrapper,
            quoteTokenReceived
        );

        return quoteTokenReceived;
    }

    function validateMinimumQuoteToken(
        OpenTx transaction,
        uint256 totalQuoteTokenReceived
    )
        internal
        pure
    {
        uint256 loanOfferingMinimumQuoteToken = MathHelpers.getPartialAmountRoundedUp(
            transaction.principal,
            transaction.loanOffering.rates.maxAmount,
            transaction.loanOffering.rates.minQuoteToken
        );

        require(totalQuoteTokenReceived >= loanOfferingMinimumQuoteToken);
    }

    function getLoanOfferingAddresses(
        OpenTx transaction
    )
        internal
        pure
        returns (address[9])
    {
        return [
            transaction.baseToken,
            transaction.quoteToken,
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
            transaction.loanOffering.rates.minQuoteToken,
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
