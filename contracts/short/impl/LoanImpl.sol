pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { Math } from "zeppelin-solidity/contracts/math/Math.sol";
import { ShortSellCommon } from "./ShortSellCommon.sol";
import { ShortSellState } from "./ShortSellState.sol";
import { CallLoanDelegator } from "../interfaces/CallLoanDelegator.sol";
import { MathHelpers } from "../../lib/MathHelpers.sol";


/**
 * @title LoanImpl
 * @author dYdX
 *
 * This library contains the implementation for the following functions of ShortSell:
 *
 *      - callInLoan
 *      - cancelLoanCallImpl
 *      - cancelLoanOffering
 *      - approveLoanOffering
 */
library LoanImpl {
    using SafeMath for uint256;

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
        uint256 requiredDeposit
    );

    /**
     * A loan call was canceled
     */
    event LoanCallCanceled(
        bytes32 indexed id,
        address indexed lender,
        address indexed shortSeller,
        uint256 depositAmount
    );

    /**
     * A loan offering was canceled before it was used. Any amount less than the
     * total for the loan offering can be canceled.
     */
    event LoanOfferingCanceled(
        bytes32 indexed loanHash,
        address indexed payer,
        address indexed feeRecipient,
        uint256 cancelAmount
    );

    /**
     * A loan offering was approved on-chain by a lender
     */
    event LoanOfferingApproved(
        bytes32 indexed loanHash,
        address indexed payer,
        address indexed feeRecipient
    );

    // -----------------------------------------
    // ---- Public Implementation Functions ----
    // -----------------------------------------

    function callInLoanImpl(
        ShortSellState.State storage state,
        bytes32 shortId,
        uint256 requiredDeposit
    )
        public
    {
        ShortSellCommon.Short storage short = ShortSellCommon.getShortObject(state, shortId);

        // If not the lender, requires the lender to approve msg.sender
        if (msg.sender != short.lender) {
            require(
                CallLoanDelegator(short.lender).callInLoanOnBehalfOf(msg.sender, shortId, requiredDeposit)
            );
        }

        // Ensure the loan has not already been called
        require(short.callTimestamp == 0);
        require(
            uint256(uint32(block.timestamp)) == block.timestamp
        );

        short.callTimestamp = uint32(block.timestamp);
        short.requiredDeposit = requiredDeposit;

        emit LoanCalled(
            shortId,
            short.lender,
            short.seller,
            requiredDeposit
        );
    }

    function cancelLoanCallImpl(
        ShortSellState.State storage state,
        bytes32 shortId
    )
        public
    {
        ShortSellCommon.Short storage short = ShortSellCommon.getShortObject(state, shortId);

        // If not the lender, requires the lender to approve msg.sender
        if (msg.sender != short.lender) {
            require(
                CallLoanDelegator(short.lender).cancelLoanCallOnBehalfOf(msg.sender, shortId)
            );
        }

        // Ensure the loan has been called
        require(short.callTimestamp > 0);

        state.shorts[shortId].callTimestamp = 0;
        state.shorts[shortId].requiredDeposit = 0;

        emit LoanCallCanceled(
            shortId,
            short.lender,
            short.seller,
            0
        );
    }

    function cancelLoanOfferingImpl(
        ShortSellState.State storage state,
        address[9] addresses,
        uint256[7] values256,
        uint32[4]  values32,
        uint256    cancelAmount
    )
        public
        returns (uint256 _cancelledAmount)
    {
        ShortSellCommon.LoanOffering memory loanOffering = parseLoanOffering(
            addresses,
            values256,
            values32
        );

        require(msg.sender == loanOffering.payer || msg.sender == loanOffering.signer);
        require(loanOffering.expirationTimestamp > block.timestamp);

        uint256 remainingAmount = loanOffering.rates.maxAmount.sub(
            ShortSellCommon.getUnavailableLoanOfferingAmountImpl(state, loanOffering.loanHash)
        );
        uint256 amountToCancel = Math.min256(remainingAmount, cancelAmount);

        // If the loan was already fully canceled, then just return 0 amount was canceled
        if (amountToCancel == 0) {
            return 0;
        }

        state.loanCancels[loanOffering.loanHash] =
            state.loanCancels[loanOffering.loanHash].add(amountToCancel);

        emit LoanOfferingCanceled(
            loanOffering.loanHash,
            loanOffering.payer,
            loanOffering.feeRecipient,
            amountToCancel
        );

        return amountToCancel;
    }

    function approveLoanOfferingImpl(
        ShortSellState.State storage state,
        address[9] addresses,
        uint256[7] values256,
        uint32[4]  values32
    )
        public
    {
        ShortSellCommon.LoanOffering memory loanOffering = parseLoanOffering(
            addresses,
            values256,
            values32
        );

        require(loanOffering.payer == msg.sender);
        require(loanOffering.expirationTimestamp > block.timestamp);

        state.isLoanApproved[loanOffering.loanHash] = true;

        emit LoanOfferingApproved(
            loanOffering.loanHash,
            loanOffering.payer,
            loanOffering.feeRecipient
        );
    }

    // ------ Parsing Functions ------

    function parseLoanOffering(
        address[9] addresses,
        uint256[7] values256,
        uint32[4]  values32
    )
        internal
        view
        returns (ShortSellCommon.LoanOffering _loanOffering)
    {
        ShortSellCommon.LoanOffering memory loanOffering = ShortSellCommon.LoanOffering({
            payer: addresses[2],
            signer: addresses[3],
            owner: addresses[4],
            taker: addresses[5],
            feeRecipient: addresses[6],
            lenderFeeToken: addresses[7],
            takerFeeToken: addresses[8],
            rates: parseLoanOfferRates(values256, values32),
            expirationTimestamp: values256[5],
            callTimeLimit: values32[0],
            maxDuration: values32[1],
            salt: values256[6],
            loanHash: 0,
            signature: ShortSellCommon.Signature({
                v: 0,
                r: "",
                s: ""
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
        uint256[7] values256,
        uint32[4] values32
    )
        internal
        pure
        returns (ShortSellCommon.LoanRates _loanRates)
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
}
