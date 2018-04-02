pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { ShortSellCommon } from "./ShortSellCommon.sol";
import { Vault } from "../Vault.sol";
import { MathHelpers } from "../../lib/MathHelpers.sol";
import { ShortSellState } from "./ShortSellState.sol";
import { TransferInternal } from "./TransferInternal.sol";
import { ShortOwner } from "../interfaces/ShortOwner.sol";
import { LoanOwner } from "../interfaces/LoanOwner.sol";
import { ShortShared } from "./ShortShared.sol";

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
        uint256 interestRate,
        uint32  callTimeLimit,
        uint32  maxDuration,
        uint32  interestPeriod
    );

    // -------------------------------------------
    // ----- Public Implementation Functions -----
    // -------------------------------------------

    function shortImpl(
        ShortSellState.State storage state,
        address[11] addresses,
        uint256[10] values256,
        uint32[3] values32,
        uint8 sigV,
        bytes32[2] sigRS,
        bytes orderData
    )
        public
        returns (bytes32 _shortId)
    {
        ShortShared.ShortTx memory transaction = parseShortTx(
            addresses,
            values256,
            values32,
            sigV,
            sigRS
        );

        bytes32 shortId = getNextShortId(state, transaction.loanOffering.loanHash);

        uint256 baseTokenReceived = ShortShared.shortInternalPreStateUpdate(
            state,
            transaction,
            shortId,
            orderData
        );

        ShortShared.validateMinimumBaseToken(
            transaction,
            baseTokenReceived
        );

        updateState(
            state,
            shortId,
            transaction
        );

        ShortShared.shortInternalPostStateUpdate(
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

    // --------- Helper Functions ---------

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

    function recordShortInitiated(
        bytes32 shortId,
        address shortSeller,
        ShortShared.ShortTx transaction,
        uint256 baseTokenReceived
    )
        internal
    {
        emit ShortInitiated(
            shortId,
            shortSeller,
            transaction.loanOffering.lender,
            transaction.loanOffering.loanHash,
            transaction.underlyingToken,
            transaction.baseToken,
            transaction.loanOffering.feeRecipient,
            transaction.effectiveAmount,
            baseTokenReceived,
            transaction.depositAmount,
            transaction.loanOffering.rates.interestRate,
            transaction.loanOffering.callTimeLimit,
            transaction.loanOffering.maxDuration,
            transaction.loanOffering.rates.interestPeriod
        );
    }

    function updateState(
        ShortSellState.State storage state,
        bytes32 shortId,
        ShortShared.ShortTx transaction
    )
        internal
    {
        assert(!ShortSellCommon.containsShortImpl(state, shortId));

        // Update global amounts for the loan and lender
        state.loanFills[transaction.loanOffering.loanHash] =
            state.loanFills[transaction.loanOffering.loanHash].add(transaction.effectiveAmount);
        state.loanNumbers[transaction.loanOffering.loanHash] =
            state.loanNumbers[transaction.loanOffering.loanHash].add(1);

        state.shorts[shortId].underlyingToken = transaction.underlyingToken;
        state.shorts[shortId].baseToken = transaction.baseToken;
        state.shorts[shortId].shortAmount = transaction.effectiveAmount;
        state.shorts[shortId].interestRate = transaction.loanOffering.rates.interestRate;
        state.shorts[shortId].callTimeLimit = transaction.loanOffering.callTimeLimit;
        state.shorts[shortId].startTimestamp = uint32(block.timestamp);
        state.shorts[shortId].maxDuration = transaction.loanOffering.maxDuration;
        state.shorts[shortId].interestPeriod = transaction.loanOffering.rates.interestPeriod;
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

    // -------- Parsing Functions -------

    function parseShortTx(
        address[11] addresses,
        uint256[10] values256,
        uint32[3] values32,
        uint8 sigV,
        bytes32[2] sigRS
    )
        internal
        view
        returns (ShortShared.ShortTx _transaction)
    {
        ShortShared.ShortTx memory transaction = ShortShared.ShortTx({
            owner: addresses[0],
            underlyingToken: addresses[1],
            baseToken: addresses[2],
            effectiveAmount: values256[8],
            lenderAmount: values256[8],
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
        uint32[3] values32,
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
            rates: parseLoanOfferRates(values256, values32),
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
        uint256[10] values256,
        uint32[3] values32
    )
        internal
        pure
        returns (ShortSellCommon.LoanRates _loanRates)
    {
        ShortSellCommon.LoanRates memory rates = ShortSellCommon.LoanRates({
            maxAmount: values256[0],
            minAmount: values256[1],
            minBaseToken: values256[2],
            interestRate: values256[3],
            lenderFee: values256[4],
            takerFee: values256[5],
            interestPeriod: values32[2]
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
}
