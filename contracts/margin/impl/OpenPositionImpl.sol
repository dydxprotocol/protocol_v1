pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { MarginCommon } from "./MarginCommon.sol";
import { MarginState } from "./MarginState.sol";
import { OpenPositionShared } from "./OpenPositionShared.sol";
import { TransferInternal } from "./TransferInternal.sol";
import { LoanOwner } from "../interfaces/LoanOwner.sol";
import { PositionOwner } from "../interfaces/PositionOwner.sol";


/**
 * @title OpenPositionImpl
 * @author dYdX
 *
 * This library contains the implementation for the openPosition function of Margin
 */
library OpenPositionImpl {
    using SafeMath for uint256;

    // ============ Events ============

    /**
     * A position was opened
     */
    event PositionOpened(
        bytes32 indexed positionId,
        address indexed trander,
        address indexed lender,
        bytes32 loanHash,
        address owedToken,
        address heldToken,
        address loanFeeRecipient,
        uint256 principal,
        uint256 heldTokenFromSell,
        uint256 depositAmount,
        uint256 interestRate,
        uint32  callTimeLimit,
        uint32  maxDuration,
        bool    depositInHeldToken
    );

    // ============ Public Implementation Functions ============

    function openPositionImpl(
        MarginState.State storage state,
        address[11] addresses,
        uint256[9] values256,
        uint32[4] values32,
        uint8 sigV,
        bytes32[2] sigRS,
        bool depositInHeldToken,
        bytes orderData
    )
        public
        returns (bytes32)
    {
        OpenPositionShared.OpenTx memory transaction = parseOpenTx(
            addresses,
            values256,
            values32,
            sigV,
            sigRS,
            depositInHeldToken
        );

        bytes32 positionId = getNextpositionId(state, transaction.loanOffering.loanHash);

        uint256 heldTokenFromSell;

        (heldTokenFromSell,) = OpenPositionShared.openPositionInternalPreStateUpdate(
            state,
            transaction,
            positionId,
            orderData
        );

        // Comes before updateState() so that PositionOpened event is before Transferred events
        recordPositionOpened(
            positionId,
            msg.sender,
            transaction,
            heldTokenFromSell
        );

        updateState(
            state,
            positionId,
            transaction
        );

        return positionId;
    }

    // ============ Helper Functions ============

    function getNextpositionId(
        MarginState.State storage state,
        bytes32 loanHash
    )
        internal
        view
        returns (bytes32)
    {
        bytes32 positionId = keccak256(
            loanHash,
            state.loanNumbers[loanHash]
        );

        // Make this positionId doesn't already exist
        assert(!MarginCommon.containsPositionImpl(state, positionId));

        return positionId;
    }

    function recordPositionOpened(
        bytes32 positionId,
        address trader,
        OpenPositionShared.OpenTx transaction,
        uint256 heldTokenReceived
    )
        internal
    {
        emit PositionOpened(
            positionId,
            trader,
            transaction.loanOffering.payer,
            transaction.loanOffering.loanHash,
            transaction.owedToken,
            transaction.heldToken,
            transaction.loanOffering.feeRecipient,
            transaction.principal,
            heldTokenReceived,
            transaction.depositAmount,
            transaction.loanOffering.rates.interestRate,
            transaction.loanOffering.callTimeLimit,
            transaction.loanOffering.maxDuration,
            transaction.depositInHeldToken
        );
    }

    function updateState(
        MarginState.State storage state,
        bytes32 positionId,
        OpenPositionShared.OpenTx transaction
    )
        internal
    {
        assert(!MarginCommon.containsPositionImpl(state, positionId));

        // Update global amounts for the loan and lender
        state.loanFills[transaction.loanOffering.loanHash] =
            state.loanFills[transaction.loanOffering.loanHash].add(transaction.principal);
        state.loanNumbers[transaction.loanOffering.loanHash] =
            state.loanNumbers[transaction.loanOffering.loanHash].add(1);

        state.positions[positionId].owedToken = transaction.owedToken;
        state.positions[positionId].heldToken = transaction.heldToken;
        state.positions[positionId].principal = transaction.principal;
        state.positions[positionId].callTimeLimit = transaction.loanOffering.callTimeLimit;
        state.positions[positionId].startTimestamp = uint32(block.timestamp);
        state.positions[positionId].maxDuration = transaction.loanOffering.maxDuration;
        state.positions[positionId].interestRate = transaction.loanOffering.rates.interestRate;
        state.positions[positionId].interestPeriod = transaction.loanOffering.rates.interestPeriod;

        bool newLender = transaction.loanOffering.owner != transaction.loanOffering.payer;
        bool newOwner = transaction.owner != msg.sender;

        state.positions[positionId].lender = TransferInternal.grantLoanOwnership(
            positionId,
            newLender ? transaction.loanOffering.payer : address(0),
            transaction.loanOffering.owner);

        state.positions[positionId].owner = TransferInternal.grantPositionOwnership(
            positionId,
            newOwner ? msg.sender : address(0),
            transaction.owner);
    }

    // ============ Parsing Functions ============

    function parseOpenTx(
        address[11] addresses,
        uint256[9] values256,
        uint32[4] values32,
        uint8 sigV,
        bytes32[2] sigRS,
        bool depositInHeldToken
    )
        internal
        view
        returns (OpenPositionShared.OpenTx memory)
    {
        OpenPositionShared.OpenTx memory transaction = OpenPositionShared.OpenTx({
            owner: addresses[0],
            owedToken: addresses[1],
            heldToken: addresses[2],
            principal: values256[7],
            lenderAmount: values256[7],
            depositAmount: values256[8],
            loanOffering: parseLoanOffering(
                addresses,
                values256,
                values32,
                sigV,
                sigRS
            ),
            exchangeWrapper: addresses[10],
            depositInHeldToken: depositInHeldToken,
            desiredTokenFromSell: 0
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
        returns (MarginCommon.LoanOffering memory)
    {
        MarginCommon.LoanOffering memory loanOffering = MarginCommon.LoanOffering({
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

        loanOffering.loanHash = MarginCommon.getLoanOfferingHash(
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
        returns (MarginCommon.LoanRates memory)
    {
        MarginCommon.LoanRates memory rates = MarginCommon.LoanRates({
            maxAmount: values256[0],
            minAmount: values256[1],
            minHeldToken: values256[2],
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
