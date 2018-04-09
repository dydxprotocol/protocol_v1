pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { ShortSellCommon } from "./ShortSellCommon.sol";
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
        address baseToken,
        address quoteToken,
        address loanFeeRecipient,
        uint256 shortAmount,
        uint256 quoteTokenFromSell,
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
        uint256[9] values256,
        uint32[4] values32,
        uint8 sigV,
        bytes32[2] sigRS,
        bool depositInQuoteToken,
        bytes orderData
    )
        public
        returns (bytes32)
    {
        ShortShared.ShortTx memory transaction = parseShortTx(
            addresses,
            values256,
            values32,
            sigV,
            sigRS,
            depositInQuoteToken
        );

        bytes32 shortId = getNextShortId(state, transaction.loanOffering.loanHash);

        uint256 quoteTokenFromSell;

        (quoteTokenFromSell,) = ShortShared.shortInternalPreStateUpdate(
            state,
            transaction,
            shortId,
            orderData
        );

        // Comes before updateState() so that ShortInitiated event is before Transferred events
        recordShortInitiated(
            shortId,
            msg.sender,
            transaction,
            quoteTokenFromSell
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

        return shortId;
    }

    // --------- Helper Functions ---------

    function getNextShortId(
        ShortSellState.State storage state,
        bytes32 loanHash
    )
        internal
        view
        returns (bytes32)
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
        uint256 quoteTokenReceived
    )
        internal
    {
        emit ShortInitiated(
            shortId,
            shortSeller,
            transaction.loanOffering.payer,
            transaction.loanOffering.loanHash,
            transaction.baseToken,
            transaction.quoteToken,
            transaction.loanOffering.feeRecipient,
            transaction.effectiveAmount,
            quoteTokenReceived,
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

        state.shorts[shortId].baseToken = transaction.baseToken;
        state.shorts[shortId].quoteToken = transaction.quoteToken;
        state.shorts[shortId].shortAmount = transaction.effectiveAmount;
        state.shorts[shortId].callTimeLimit = transaction.loanOffering.callTimeLimit;
        state.shorts[shortId].startTimestamp = uint32(block.timestamp);
        state.shorts[shortId].maxDuration = transaction.loanOffering.maxDuration;
        state.shorts[shortId].interestRate = transaction.loanOffering.rates.interestRate;
        state.shorts[shortId].interestPeriod = transaction.loanOffering.rates.interestPeriod;

        bool newLender = transaction.loanOffering.owner != transaction.loanOffering.payer;
        bool newSeller = transaction.owner != msg.sender;

        state.shorts[shortId].lender = TransferInternal.grantLoanOwnership(
            shortId,
            newLender ? transaction.loanOffering.payer : address(0),
            transaction.loanOffering.owner);

        state.shorts[shortId].seller = TransferInternal.grantShortOwnership(
            shortId,
            newSeller ? msg.sender : address(0),
            transaction.owner);
    }

    // -------- Parsing Functions -------

    function parseShortTx(
        address[11] addresses,
        uint256[9] values256,
        uint32[4] values32,
        uint8 sigV,
        bytes32[2] sigRS,
        bool depositInQuoteToken
    )
        internal
        view
        returns (ShortShared.ShortTx memory)
    {
        ShortShared.ShortTx memory transaction = ShortShared.ShortTx({
            owner: addresses[0],
            baseToken: addresses[1],
            quoteToken: addresses[2],
            effectiveAmount: values256[7],
            lenderAmount: values256[7],
            depositAmount: values256[8],
            loanOffering: parseLoanOffering(
                addresses,
                values256,
                values32,
                sigV,
                sigRS
            ),
            exchangeWrapperAddress: addresses[10],
            depositInQuoteToken: depositInQuoteToken
        });

        return transaction;
    }

    function parseLoanOffering(
        address[11] addresses,
        uint256[9] values256,
        uint32[4] values32,
        uint8 sigV,
        bytes32[2] sigRS
    )
        internal
        view
        returns (ShortSellCommon.LoanOffering memory)
    {
        ShortSellCommon.LoanOffering memory loanOffering = ShortSellCommon.LoanOffering({
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

        loanOffering.loanHash = ShortSellCommon.getLoanOfferingHash(
            loanOffering,
            addresses[2],
            addresses[1]
        );

        return loanOffering;
    }

    function parseLoanOfferRates(
        uint256[9] values256,
        uint32[4] values32
    )
        internal
        pure
        returns (ShortSellCommon.LoanRates memory)
    {
        ShortSellCommon.LoanRates memory rates = ShortSellCommon.LoanRates({
            maxAmount: values256[0],
            minAmount: values256[1],
            minQuoteToken: values256[2],
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
        returns (ShortSellCommon.Signature memory)
    {
        ShortSellCommon.Signature memory signature = ShortSellCommon.Signature({
            v: sigV,
            r: sigRS[0],
            s: sigRS[1]
        });

        return signature;
    }
}
