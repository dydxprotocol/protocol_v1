pragma solidity 0.4.19;

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { Math } from "zeppelin-solidity/contracts/math/Math.sol";
import { ShortSellCommon } from "./ShortSellCommon.sol";
import { ShortSellState } from "./ShortSellState.sol";
import { ShortSellRepo } from "../ShortSellRepo.sol";
import { MathHelpers } from "../../lib/MathHelpers.sol";


/**
 * @title LoanImpl
 * @author dYdX
 *
 * This library contains the implementation for the following functions of ShortSell:
 *
 *      - callInLoan
 *      - cancelLoanCall
 *      - cancelLoanOffering
 */
library LoanImpl {
    using SafeMath for uint;

    // ------------------------
    // -------- Events --------
    // ------------------------

    /**
     * The loan for a short sell was called in
     */
    event LoanCalled(
        bytes32 indexed id,
        address indexed lender,
        address indexed shortSeller,
        address caller
    );

    /**
     * A loan call was canceled
     */
    event LoanCallCanceled(
        bytes32 indexed id,
        address indexed lender,
        address indexed shortSeller,
        address caller
    );

    /**
     * A loan offering was canceled before it was used. Any amount less than the
     * total for the loan offering can be canceled.
     */
    event LoanOfferingCanceled(
        bytes32 indexed loanHash,
        address indexed lender,
        address indexed feeRecipient,
        uint cancelAmount
    );

    /**
     * A loan offering was approved on-chain by a lender
     */
    event LoanOfferingApproved(
        bytes32 indexed loanHash,
        address indexed lender,
        address indexed feeRecipient
    );

    // -------------------------------------------
    // ---- Internal Implementation Functions ----
    // -------------------------------------------

    function callInLoanImpl(
        ShortSellState.State storage state,
        bytes32 shortId
    )
        public
    {
        ShortSellCommon.Short memory short = ShortSellCommon.getShortObject(state.REPO, shortId);
        require(msg.sender == short.lender);
        // Ensure the loan has not already been called
        require(short.callTimestamp == 0);
        require(
            uint(uint32(block.timestamp)) == block.timestamp
        );

        ShortSellRepo(state.REPO).setShortCallStart(shortId, uint32(block.timestamp));

        LoanCalled(
            shortId,
            short.lender,
            short.seller,
            msg.sender
        );
    }

    function cancelLoanCallImpl(
        ShortSellState.State storage state,
        bytes32 shortId
    )
        public
    {
        ShortSellCommon.Short memory short = ShortSellCommon.getShortObject(state.REPO, shortId);
        require(msg.sender == short.lender);
        // Ensure the loan has been called
        require(short.callTimestamp > 0);

        ShortSellRepo(state.REPO).setShortCallStart(shortId, 0);

        ShortSellCommon.payBackAuctionBidderIfExists(
            state,
            shortId,
            short
        );

        LoanCallCanceled(
            shortId,
            short.lender,
            short.seller,
            msg.sender
        );
    }

    function cancelLoanOfferingImpl(
        ShortSellState.State storage state,
        address[8] addresses,
        uint[9] values256,
        uint32[2] values32,
        uint cancelAmount
    )
        public
        returns (uint _cancelledAmount)
    {
        ShortSellCommon.LoanOffering memory loanOffering = parseLoanOffering(
            addresses,
            values256,
            values32
        );

        require(loanOffering.lender == msg.sender);
        require(loanOffering.expirationTimestamp > block.timestamp);

        uint remainingAmount = loanOffering.rates.maxAmount.sub(
            ShortSellCommon.getUnavailableLoanOfferingAmountImpl(state, loanOffering.loanHash)
        );
        uint amountToCancel = Math.min256(remainingAmount, cancelAmount);

        // If the loan was already fully canceled, then just return 0 amount was canceled
        if (amountToCancel == 0) {
            return 0;
        }

        state.loanCancels[loanOffering.loanHash] =
            state.loanCancels[loanOffering.loanHash].add(amountToCancel);

        LoanOfferingCanceled(
            loanOffering.loanHash,
            loanOffering.lender,
            loanOffering.feeRecipient,
            amountToCancel
        );

        return amountToCancel;
    }

    function approveLoanOffering(
        ShortSellState.State storage state,
        address[8] addresses,
        uint[9] values256,
        uint32[2] values32
    )
        public
    {
        ShortSellCommon.LoanOffering memory loanOffering = parseLoanOffering(
            addresses,
            values256,
            values32
        );

        require(loanOffering.lender == msg.sender);
        require(loanOffering.expirationTimestamp > block.timestamp);

        state.isLoanApproved[loanOffering.loanHash] = true;

        LoanOfferingApproved(
            loanOffering.loanHash,
            loanOffering.lender,
            loanOffering.feeRecipient
        );
    }

    // ------ Parsing Functions ------

    function parseLoanOffering(
        address[8] addresses,
        uint[9] values,
        uint32[2] values32
    )
        internal
        view
        returns (ShortSellCommon.LoanOffering _loanOffering)
    {
        ShortSellCommon.LoanOffering memory loanOffering = ShortSellCommon.LoanOffering({
            lender: addresses[2],
            signer: addresses[3],
            taker: addresses[4],
            feeRecipient: addresses[5],
            lenderFeeToken: addresses[6],
            takerFeeToken: addresses[7],
            rates: parseLoanOfferRates(values),
            expirationTimestamp: values[7],
            callTimeLimit: values32[0],
            maxDuration: values32[1],
            salt: values[8],
            loanHash: 0,
            signature: ShortSellCommon.Signature({
                v: 0,
                r: "0x",
                s: "0x"
            })
        });

        loanOffering.loanHash = ShortSellCommon.getLoanOfferingHash(
            loanOffering,
            addresses[1],
            addresses[0]
        );

        return loanOffering;
    }

    function parseLoanOfferRates(
        uint[9] values
    )
        internal
        pure
        returns (ShortSellCommon.LoanRates _loanRates)
    {
        ShortSellCommon.LoanRates memory rates = ShortSellCommon.LoanRates({
            minimumDeposit: values[0],
            maxAmount: values[1],
            minAmount: values[2],
            minimumSellAmount: values[3],
            dailyInterestFee: values[4],
            lenderFee: values[5],
            takerFee: values[6]
        });

        return rates;
    }
}
