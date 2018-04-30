pragma solidity 0.4.23;
pragma experimental "v0.5.0";

import { Math } from "zeppelin-solidity/contracts/math/Math.sol";
import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { MarginCommon } from "./MarginCommon.sol";
import { MarginState } from "./MarginState.sol";
import { MarginCallDelegator } from "../interfaces/MarginCallDelegator.sol";


/**
 * @title LoanImpl
 * @author dYdX
 *
 * This library contains the implementation for the following functions of Margin:
 *
 *      - marginCall
 *      - cancelMarginCallImpl
 *      - cancelLoanOffering
 *      - approveLoanOffering
 */
library LoanImpl {
    using SafeMath for uint256;

    // ============ Events ============

    /**
     * A position was margin-called
     */
    event MarginCallInitiated(
        bytes32 indexed positionId,
        address indexed lender,
        address indexed owner,
        uint256 requiredDeposit
    );

    /**
     * A margin call was canceled
     */
    event MarginCallCanceled(
        bytes32 indexed positionId,
        address indexed lender,
        address indexed owner,
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

    // ============ Public Implementation Functions ============

    function marginCallImpl(
        MarginState.State storage state,
        bytes32 positionId,
        uint256 requiredDeposit
    )
        public
    {
        MarginCommon.Position storage position =
            MarginCommon.getPositionFromStorage(state, positionId);

        // If not the lender, requires the lender to approve msg.sender
        if (msg.sender != position.lender) {
            require(
                MarginCallDelegator(position.lender).marginCallOnBehalfOf(
                    msg.sender,
                    positionId,
                    requiredDeposit
                )
            );
        }

        // Ensure the loan has not already been called
        require(position.callTimestamp == 0);
        require(
            uint256(uint32(block.timestamp)) == block.timestamp
        );

        position.callTimestamp = uint32(block.timestamp);
        position.requiredDeposit = requiredDeposit;

        emit MarginCallInitiated(
            positionId,
            position.lender,
            position.owner,
            requiredDeposit
        );
    }

    function cancelMarginCallImpl(
        MarginState.State storage state,
        bytes32 positionId
    )
        public
    {
        MarginCommon.Position storage position =
            MarginCommon.getPositionFromStorage(state, positionId);

        // If not the lender, requires the lender to approve msg.sender
        if (msg.sender != position.lender) {
            require(
                MarginCallDelegator(position.lender).cancelMarginCallOnBehalfOf(
                    msg.sender,
                    positionId
                )
            );
        }

        // Ensure the loan has been called
        require(position.callTimestamp > 0);

        state.positions[positionId].callTimestamp = 0;
        state.positions[positionId].requiredDeposit = 0;

        emit MarginCallCanceled(
            positionId,
            position.lender,
            position.owner,
            0
        );
    }

    function cancelLoanOfferingImpl(
        MarginState.State storage state,
        address[9] addresses,
        uint256[7] values256,
        uint32[4]  values32,
        uint256    cancelAmount
    )
        public
        returns (uint256)
    {
        MarginCommon.LoanOffering memory loanOffering = parseLoanOffering(
            addresses,
            values256,
            values32
        );

        require(msg.sender == loanOffering.payer || msg.sender == loanOffering.signer);
        require(loanOffering.expirationTimestamp > block.timestamp);

        uint256 remainingAmount = loanOffering.rates.maxAmount.sub(
            MarginCommon.getUnavailableLoanOfferingAmountImpl(state, loanOffering.loanHash)
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
        MarginState.State storage state,
        address[9] addresses,
        uint256[7] values256,
        uint32[4]  values32
    )
        public
    {
        MarginCommon.LoanOffering memory loanOffering = parseLoanOffering(
            addresses,
            values256,
            values32
        );

        require(loanOffering.signer == msg.sender);
        require(loanOffering.expirationTimestamp > block.timestamp);

        if (state.approvedLoans[loanOffering.loanHash]) {
            return;
        }

        state.approvedLoans[loanOffering.loanHash] = true;

        emit LoanOfferingApproved(
            loanOffering.loanHash,
            loanOffering.payer,
            loanOffering.feeRecipient
        );
    }

    // ============ Parsing Functions ============

    function parseLoanOffering(
        address[9] addresses,
        uint256[7] values256,
        uint32[4]  values32
    )
        internal
        view
        returns (MarginCommon.LoanOffering memory)
    {
        MarginCommon.LoanOffering memory loanOffering = MarginCommon.LoanOffering({
            owedToken: addresses[0],
            heldToken: addresses[1],
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
            signature: MarginCommon.Signature({
                v: 0,
                r: "",
                s: ""
            })
        });

        loanOffering.loanHash = MarginCommon.getLoanOfferingHash(loanOffering);

        return loanOffering;
    }

    function parseLoanOfferRates(
        uint256[7] values256,
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
}
