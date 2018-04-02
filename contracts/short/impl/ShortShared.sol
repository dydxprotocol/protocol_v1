pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { ShortSellCommon } from "./ShortSellCommon.sol";
import { ShortSellState } from "./ShortSellState.sol";
import { Vault } from "../Vault.sol";
import { Proxy } from "../Proxy.sol";
import { MathHelpers } from "../../lib/MathHelpers.sol";
import { LoanOfferingVerifier } from "../interfaces/LoanOfferingVerifier.sol";
import { ExchangeWrapper } from "../interfaces/ExchangeWrapper.sol";


/**
 * @title ShortShared
 * @author dYdX
 *
 * This library contains shared functionality between ShortImpl and AddValueToShortImpl
 */
library ShortShared {
    using SafeMath for uint256;

    // -----------------------
    // ------- Structs -------
    // -----------------------

    struct ShortTx {
        address owner;
        address underlyingToken;
        address baseToken;
        uint256 shortAmount;
        uint256 depositAmount;
        ShortSellCommon.LoanOffering loanOffering;
        address exchangeWrapperAddress;
    }

    // -------------------------------------------
    // ---- Internal Implementation Functions ----
    // -------------------------------------------

    function shortInternalPreStateUpdate(
        ShortSellState.State storage state,
        ShortTx memory transaction,
        bytes32 shortId,
        bytes orderData
    )
        internal
        returns (uint256 _baseTokenReceived)
    {
        // Validate
        validateShort(
            state,
            transaction
        );

        // First pull funds from lender and sell them. Prefer to do this first to make order
        // collisions use up less gas.
        // NOTE: Doing this before updating state relies on #short being non-reentrant
        transferFromLender(state, transaction);
        uint256 baseTokenReceived = executeSell(
            state,
            transaction,
            orderData,
            shortId
        );

        return baseTokenReceived;
    }

    function shortInternalPostStateUpdate(
        ShortSellState.State storage state,
        ShortTx memory transaction,
        bytes32 shortId
    )
        internal
    {
        // If the lender is a smart contract, call out to it to get its consent for this loan
        // This is done after other validations/state updates as it is an external call
        // NOTE: The short will exist in the Repo for this call
        //       (possible other contract calls back into ShortSell)
        getConsentIfSmartContractLender(transaction, shortId);

        transferDepositAndFees(
            state,
            shortId,
            transaction
        );
    }

    function validateShort(
        ShortSellState.State storage state,
        ShortTx transaction
    )
        internal
        view
    {
        // Disallow 0 value shorts
        require(transaction.shortAmount > 0);

        // If the taker is 0x000... then anyone can take it. Otherwise only the taker can use it
        if (transaction.loanOffering.taker != address(0)) {
            require(msg.sender == transaction.loanOffering.taker);
        }

        // Require the order to either be pre-approved on-chain or to have a valid signature
        require(
            state.isLoanApproved[transaction.loanOffering.loanHash]
            || isValidSignature(transaction.loanOffering)
        );

        // Validate the short amount is <= than max and >= min
        require(
            transaction.shortAmount.add(
                ShortSellCommon.getUnavailableLoanOfferingAmountImpl(
                    state,
                    transaction.loanOffering.loanHash
                )
            ) <= transaction.loanOffering.rates.maxAmount
        );
        require(transaction.shortAmount >= transaction.loanOffering.rates.minAmount);
        require(transaction.loanOffering.expirationTimestamp > block.timestamp);

        // Check no casting errors
        require(
            uint256(uint32(block.timestamp)) == block.timestamp
        );

        // Disallow zero address owners
        require(transaction.owner != address(0));
        require(transaction.loanOffering.owner != address(0));

        // The minimum base token is validated after executing the sell
    }

    function isValidSignature(
        ShortSellCommon.LoanOffering loanOffering
    )
        internal
        pure
        returns (bool _isValid)
    {
        address recoveredSigner = ecrecover(
            keccak256("\x19Ethereum Signed Message:\n32", loanOffering.loanHash),
            loanOffering.signature.v,
            loanOffering.signature.r,
            loanOffering.signature.s
        );

        return loanOffering.signer == recoveredSigner;
    }

    function getConsentIfSmartContractLender(
        ShortTx transaction,
        bytes32 shortId
    )
        internal
    {
        // If the signer is not the lender, the lender must be a smart contract, and we must
        // get its consent
        if (transaction.loanOffering.signer != transaction.loanOffering.lender) {
            require(
                LoanOfferingVerifier(transaction.loanOffering.lender).verifyLoanOffering(
                    getLoanOfferingAddresses(transaction),
                    getLoanOfferingValues256(transaction),
                    getLoanOfferingValues32(transaction),
                    shortId
                )
            );
        }
    }

    function transferFromLender(
        ShortSellState.State storage state,
        ShortTx transaction
    )
        internal
    {
        // Transfer underlying token to the exchange wrapper
        Proxy(state.PROXY).transferTo(
            transaction.underlyingToken,
            transaction.loanOffering.lender,
            transaction.exchangeWrapperAddress,
            transaction.shortAmount
        );
    }

    function transferDepositAndFees(
        ShortSellState.State storage state,
        bytes32 shortId,
        ShortTx transaction
    )
        internal
    {
        // Transfer base token deposit from the short seller
        if (transaction.depositAmount > 0) {
            Vault(state.VAULT).transferToVault(
                shortId,
                transaction.baseToken,
                msg.sender,
                transaction.depositAmount
            );
        }

        transferLoanFees(
            state,
            transaction
        );
    }

    function transferLoanFees(
        ShortSellState.State storage state,
        ShortTx transaction
    )
        internal
    {
        // 0 fee address indicates no fees
        if (transaction.loanOffering.feeRecipient == address(0)) {
            return;
        }

        Proxy proxy = Proxy(state.PROXY);

        uint256 lenderFee = MathHelpers.getPartialAmount(
            transaction.shortAmount,
            transaction.loanOffering.rates.maxAmount,
            transaction.loanOffering.rates.lenderFee
        );
        uint256 takerFee = MathHelpers.getPartialAmount(
            transaction.shortAmount,
            transaction.loanOffering.rates.maxAmount,
            transaction.loanOffering.rates.takerFee
        );

        if (lenderFee > 0) {
            proxy.transferTo(
                transaction.loanOffering.lenderFeeToken,
                transaction.loanOffering.lender,
                transaction.loanOffering.feeRecipient,
                lenderFee
            );
        }

        if (takerFee > 0) {
            proxy.transferTo(
                transaction.loanOffering.takerFeeToken,
                msg.sender,
                transaction.loanOffering.feeRecipient,
                takerFee
            );
        }
    }

    function executeSell(
        ShortSellState.State storage state,
        ShortTx transaction,
        bytes orderData,
        bytes32 shortId
    )
        internal
        returns (uint256 _baseTokenReceived)
    {
        uint256 baseTokenReceived = ExchangeWrapper(transaction.exchangeWrapperAddress).exchange(
            transaction.baseToken,
            transaction.underlyingToken,
            msg.sender,
            transaction.shortAmount,
            orderData
        );

        Vault(state.VAULT).transferToVault(
            shortId,
            transaction.baseToken,
            transaction.exchangeWrapperAddress,
            baseTokenReceived
        );

        return baseTokenReceived;
    }

    function validateMinimumBaseToken(
        ShortTx transaction,
        uint256 baseTokenReceived
    )
        internal
        pure
    {
        uint256 totalBaseToken = baseTokenReceived.add(transaction.depositAmount);
        uint256 loanOfferingMinimumBaseToken = MathHelpers.getPartialAmountRoundedUp(
            transaction.shortAmount,
            transaction.loanOffering.rates.maxAmount,
            transaction.loanOffering.rates.minBaseToken
        );

        require(totalBaseToken >= loanOfferingMinimumBaseToken);
    }

    function getLoanOfferingAddresses(
        ShortTx transaction
    )
        internal
        pure
        returns (address[9] _addresses)
    {
        return [
            transaction.underlyingToken,
            transaction.baseToken,
            transaction.loanOffering.lender,
            transaction.loanOffering.signer,
            transaction.loanOffering.owner,
            transaction.loanOffering.taker,
            transaction.loanOffering.feeRecipient,
            transaction.loanOffering.lenderFeeToken,
            transaction.loanOffering.takerFeeToken
        ];
    }

    function getLoanOfferingValues256(
        ShortTx transaction
    )
        internal
        pure
        returns (uint256[8] _values)
    {
        return [
            transaction.loanOffering.rates.maxAmount,
            transaction.loanOffering.rates.minAmount,
            transaction.loanOffering.rates.minBaseToken,
            transaction.loanOffering.rates.interestRate,
            transaction.loanOffering.rates.lenderFee,
            transaction.loanOffering.rates.takerFee,
            transaction.loanOffering.expirationTimestamp,
            transaction.loanOffering.salt
        ];
    }

    function getLoanOfferingValues32(
        ShortTx transaction
    )
        internal
        pure
        returns (uint32[3] _values)
    {
        return [
            transaction.loanOffering.callTimeLimit,
            transaction.loanOffering.maxDuration,
            transaction.loanOffering.rates.interestPeriod
        ];
    }
}
