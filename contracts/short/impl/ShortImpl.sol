pragma solidity 0.4.19;

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { ShortSellCommon } from "./ShortSellCommon.sol";
import { Vault } from "../Vault.sol";
import { Proxy } from "../Proxy.sol";
import { MathHelpers } from "../../lib/MathHelpers.sol";
import { ShortSellState } from "./ShortSellState.sol";
import { TransferInternal } from "./TransferInternal.sol";
import { LoanOfferingVerifier } from "../interfaces/LoanOfferingVerifier.sol";
import { ExchangeWrapper } from "../interfaces/ExchangeWrapper.sol";


/**
 * @title ShortImpl
 * @author dYdX
 *
 * This library contains the implementation for the short function of ShortSell
 */
library ShortImpl {
    using SafeMath for uint256;

    // ------------------------
    // -------- Events --------
    // ------------------------

    /**
     * A short sell occurred
     */
    event ShortInitiated(
        bytes32 indexed id,
        address indexed shortSeller,
        address indexed lender,
        bytes32 loanHash,
        address underlyingToken,
        address baseToken,
        address loanFeeRecipient,
        uint256 shortAmount,
        uint256 baseTokenFromSell,
        uint256 depositAmount,
        uint32 callTimeLimit,
        uint32 maxDuration
    );

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
    // ----- Public Implementation Functions -----
    // -------------------------------------------

    function shortImpl(
        ShortSellState.State storage state,
        address[11] addresses,
        uint256[10] values256,
        uint32[2] values32,
        uint8 sigV,
        bytes32[2] sigRS,
        bytes orderData
    )
        public
        returns (bytes32 _shortId)
    {
        ShortTx memory transaction = parseShortTx(
            addresses,
            values256,
            values32,
            sigV,
            sigRS
        );

        bytes32 shortId = getNextShortId(state, transaction.loanOffering.loanHash);

        uint256 minimumBaseToken = MathHelpers.getPartialAmountRoundedUp(
            transaction.shortAmount,
            transaction.loanOffering.rates.maxAmount,
            transaction.loanOffering.rates.minBaseToken
        );

        shortInternalPreStateUpdate(
            state,
            transaction,
            minimumBaseToken,
            shortId,
            orderData
        );

        updateState(
            state,
            shortId,
            transaction
        );

        shortInternalPostStateUpdate(
            state,
            transaction,
            shortId
        );

        // LOG EVENT
        // one level of indirection in order to number of variables for solidity compiler
        recordShortInitiated(
            shortId,
            msg.sender,
            transaction,
            baseTokenReceived
        );

        return shortId;
    }

    function addValueToShortImpl(
        ShortSellState.State storage state,
        bytes32 shortId,
        address[7] addresses,
        uint256[9] values256,
        uint8 sigV,
        bytes32[2] sigRS,
        bytes order
    )
        public
    {
        ShortSellCommon.Short storage short = ShortSellCommon.getShortObject(state, shortId);

        ShortTx memory transaction = parseAddValueToShortTx(
            short,
            addresses,
            values256,
            sigV,
            sigRS
        );

        uint256 baseTokenBalance = Vault(state.VAULT).balances(shortId, transaction.baseToken);
        uint256 positionMinimumBaseToken = MathHelpers.getPartialAmountRoundedUp(
            shortAmount,
            short.shortAmount,
            baseTokenBalance
        );
        uint256 loanOfferingMinimumBaseToken = MathHelpers.getPartialAmountRoundedUp(
            transaction.shortAmount,
            transaction.loanOffering.rates.maxAmount,
            transaction.loanOffering.rates.minBaseToken
        );

        require(loanOfferingMinimumBaseToken <= positionMinimumBaseToken);

        shortInternalPreStateUpdate(
            state,
            transaction,
            positionMinimumBaseToken,
            shortId,
            orderData
        );

        updateStateForAddValue(
            state,
            shortId,
            transaction
        );

        shortInternalPostStateUpdate(
            state,
            transaction,
            shortId
        );

        // LOG EVENT
    }

    // --------- Helper Functions ---------

    function shortInternalPreStateUpdate(
        ShortSellState.State storage state,
        ShortTx memory transaction,
        uint256 minimumBaseToken,
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

        validateMinimumBaseToken(
            transaction,
            baseTokenReceived,
            minimumBaseToken
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

    function getNextShortId(
        ShortSellState.State storage state,
        bytes32 loanHash
    )
        internal
        view
        returns (bytes32 _shortId)
    {
        bytes32 shortId = keccak256(
            loanHash,
            state.loanNumbers[loanHash]
        );

        // Make this shortId doesn't already exist
        assert(!ShortSellCommon.containsShortImpl(state, shortId));

        return shortId;
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
        uint256 baseTokenReceived,
        uint256 minimumBaseToken
    )
        internal
        pure
    {
        uint256 totalBaseToken = baseTokenReceived.add(transaction.depositAmount);

        require(totalBaseToken >= minimumBaseToken);
    }

    function recordShortInitiated(
        bytes32 shortId,
        address shortSeller,
        ShortTx transaction,
        uint256 baseTokenReceived
    )
        internal
    {
        ShortInitiated(
            shortId,
            shortSeller,
            transaction.loanOffering.lender,
            transaction.loanOffering.loanHash,
            transaction.underlyingToken,
            transaction.baseToken,
            transaction.loanOffering.feeRecipient,
            transaction.shortAmount,
            baseTokenReceived,
            transaction.depositAmount,
            transaction.loanOffering.callTimeLimit,
            transaction.loanOffering.maxDuration
        );
    }

    function updateState(
        ShortSellState.State storage state,
        bytes32 shortId,
        ShortTx transaction
    )
        internal
    {
        assert(!ShortSellCommon.containsShortImpl(state, shortId));

        // Update global amounts for the loan and lender
        state.loanFills[transaction.loanOffering.loanHash] =
            state.loanFills[transaction.loanOffering.loanHash].add(transaction.shortAmount);
        state.loanNumbers[transaction.loanOffering.loanHash] =
            state.loanNumbers[transaction.loanOffering.loanHash].add(1);

        state.shorts[shortId].underlyingToken = transaction.underlyingToken;
        state.shorts[shortId].baseToken = transaction.baseToken;
        state.shorts[shortId].shortAmount = transaction.shortAmount;
        state.shorts[shortId].annualInterestRate = transaction.loanOffering.rates.annualInterestRate;
        state.shorts[shortId].callTimeLimit = transaction.loanOffering.callTimeLimit;
        state.shorts[shortId].startTimestamp = uint32(block.timestamp);
        state.shorts[shortId].maxDuration = transaction.loanOffering.maxDuration;
        state.shorts[shortId].closedAmount = 0;
        state.shorts[shortId].requiredDeposit = 0;
        state.shorts[shortId].callTimestamp = 0;

        bool newLender = transaction.loanOffering.owner != transaction.loanOffering.lender;
        bool newSeller = transaction.owner != msg.sender;

        state.shorts[shortId].lender = TransferInternal.grantLoanOwnership(
            shortId,
            newLender ? transaction.loanOffering.lender : address(0),
            transaction.loanOffering.owner);

        state.shorts[shortId].seller = TransferInternal.grantShortOwnership(
            shortId,
            newSeller ? msg.sender : address(0),
            transaction.owner);
    }

    function updateStateForAddValue(
        ShortTx transaction,
        ShortSellCommon.Short storage short
    )
        internal
    {

    }

    // -------- Parsing Functions -------

    function parseShortTx(
        address[11] addresses,
        uint256[10] values256,
        uint32[2] values32,
        uint8 sigV,
        bytes32[2] sigRS
    )
        internal
        view
        returns (ShortTx _transaction)
    {
        ShortTx memory transaction = ShortTx({
            owner: addresses[0],
            underlyingToken: addresses[1],
            baseToken: addresses[2],
            shortAmount: values256[8],
            depositAmount: values256[9],
            loanOffering: parseLoanOffering(
                addresses,
                values256,
                values32,
                sigV,
                sigRS
            ),
            exchangeWrapperAddress: addresses[10]
        });

        return transaction;
    }

    function parseLoanOffering(
        address[11] addresses,
        uint256[10] values256,
        uint32[2] values32,
        uint8 sigV,
        bytes32[2] sigRS
    )
        internal
        view
        returns (ShortSellCommon.LoanOffering _loanOffering)
    {
        ShortSellCommon.LoanOffering memory loanOffering = ShortSellCommon.LoanOffering({
            lender: addresses[3],
            signer: addresses[4],
            owner: addresses[5],
            taker: addresses[6],
            feeRecipient: addresses[7],
            lenderFeeToken: addresses[8],
            takerFeeToken: addresses[9],
            rates: parseLoanOfferRates(values256),
            expirationTimestamp: values256[6],
            callTimeLimit: values32[0],
            maxDuration: values32[1],
            salt: values256[7],
            loanHash: 0,
            signature: parseLoanOfferingSignature(sigV, sigRS)
        });

        loanOffering.loanHash = ShortSellCommon.getLoanOfferingHash(
            loanOffering,
            addresses[2],
            addresses[1]
        );

        return loanOffering;
    }

    function parseLoanOfferRates(
        uint256[10] values256
    )
        internal
        pure
        returns (ShortSellCommon.LoanRates _loanRates)
    {
        ShortSellCommon.LoanRates memory rates = ShortSellCommon.LoanRates({
            maxAmount: values256[0],
            minAmount: values256[1],
            minBaseToken: values256[2],
            annualInterestRate: values256[3],
            lenderFee: values256[4],
            takerFee: values256[5]
        });

        return rates;
    }

    function parseLoanOfferingSignature(
        uint8 sigV,
        bytes32[2] sigRS
    )
        internal
        pure
        returns (ShortSellCommon.Signature _signature)
    {
        ShortSellCommon.Signature memory signature = ShortSellCommon.Signature({
            v: sigV,
            r: sigRS[0],
            s: sigRS[1]
        });

        return signature;
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
            transaction.loanOffering.rates.annualInterestRate,
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
        returns (uint32[2] _values)
    {
        return [
            transaction.loanOffering.callTimeLimit,
            transaction.loanOffering.maxDuration
        ];
    }

    function parseAddValueToShortTx(
        ShortSellCommon.Short storage short,
        address[7] addresses,
        uint256[9] values256,
        uint8 sigV,
        bytes32[2] sigRS
    )
        internal
        view
        returns (ShortTx memory)
    {
        ShortTx memory transaction = ShortTx({
            owner: addresses[0],
            underlyingToken: addresses[1],
            baseToken: addresses[2],
            shortAmount: values256[7],
            depositAmount: values256[8],
            loanOffering: parseLoanOfferingFromAddValueTx(
                short,
                addresses,
                values256,
                sigV,
                sigRS
            ),
            exchangeWrapperAddress: addresses[6]
        });

        return transaction;
    }

    function parseLoanOfferingFromAddValueTx(
        ShortSellCommon.Short storage short,
        address[7] addresses,
        uint256[9] values256,
        uint8 sigV,
        bytes32[2] sigRS
    )
        internal
        view
        returns (ShortSellCommon.LoanOffering memory)
    {
        ShortSellCommon.LoanOffering memory loanOffering = ShortSellCommon.LoanOffering({
            lender: addresses[0],
            signer: addresses[1],
            owner: short.seller,
            taker: addresses[2],
            feeRecipient: addresses[3],
            lenderFeeToken: addresses[4],
            takerFeeToken: addresses[5],
            rates: parseLoanOfferingRatesFromAddValueTx(short, values256),
            expirationTimestamp: values256[5],
            callTimeLimit: short.callTimeLimit,
            maxDuration: short.maxDuration,
            salt: values256[6],
            loanHash: 0,
            signature: parseLoanOfferingSignature(sigV, sigRS)
        });

        loanOffering.loanHash = ShortSellCommon.getLoanOfferingHash(
            loanOffering,
            short.baseToken,
            short.underlyingToken
        );

        return loanOffering;
    }

    function parseLoanOfferingRatesFromAddValueTx(
        ShortSellCommon.Short storage short,
        uint256[9] values256
    )
        internal
        view
        returns (ShortSellCommon.LoanRates memory)
    {
        ShortSellCommon.LoanRates memory rates = ShortSellCommon.LoanRates({
            maxAmount: values256[0],
            minAmount: values256[1],
            minBaseToken: values256[2],
            dailyInterestFee: short.interestRate,
            lenderFee: values256[3],
            takerFee: values256[4]
        });

        return rates;
    }
}
