pragma solidity 0.4.18;

import { ReentrancyGuard } from "zeppelin-solidity/contracts/ReentrancyGuard.sol";
import { SafeMath } from "../../lib/SafeMath.sol";
import { ShortCommonHelperFunctions } from "./ShortCommonHelperFunctions.sol";
import { ShortSellState } from "./ShortSellState.sol";
import { ShortSellEvents } from "./ShortSellEvents.sol";
import { ShortSellRepo } from "../ShortSellRepo.sol";

/**
 * @title LoanImpl
 * @author Antonio Juliano
 *
 * This contract contains the implementation for the following functions of ShortSell:
 *
 *      - callInLoan
 *      - cancelLoanCall
 *      - cancelLoanOffering
 */
 /* solium-disable-next-line */
contract LoanImpl is
    SafeMath,
    ShortSellState,
    ShortSellEvents,
    ReentrancyGuard,
    ShortCommonHelperFunctions {

    // -------------------------------------------
    // ---- Internal Implementation Functions ----
    // -------------------------------------------

    function callInLoanImpl(
        bytes32 shortId
    )
        internal
        nonReentrant
    {
        Short memory short = getShortObject(shortId);
        require(msg.sender == short.lender);
        require(block.timestamp >= add(short.startTimestamp, short.lockoutTime));
        // Ensure the loan has not already been called
        require(short.callTimestamp == 0);
        require(
            uint(uint32(block.timestamp)) == block.timestamp
        );

        ShortSellRepo(REPO).setShortCallStart(shortId, uint32(block.timestamp));

        LoanCalled(
            shortId,
            short.lender,
            short.seller,
            msg.sender,
            block.timestamp
        );
    }

    function cancelLoanCallImpl(
        bytes32 shortId
    )
        internal
        nonReentrant
    {
        Short memory short = getShortObject(shortId);
        require(msg.sender == short.lender);
        // Ensure the loan has been called
        require(short.callTimestamp > 0);

        ShortSellRepo(REPO).setShortCallStart(shortId, 0);

        payBackAuctionBidderIfExists(
            shortId,
            short
        );

        LoanCallCanceled(
            shortId,
            short.lender,
            short.seller,
            msg.sender,
            block.timestamp
        );
    }

    function cancelLoanOfferingImpl(
        address[7] addresses,
        uint[9] values256,
        uint32[3] values32,
        uint cancelAmount
    )
        internal
        nonReentrant
        returns (uint _cancelledAmount)
    {
        LoanOffering memory loanOffering = parseLoanOffering(
            addresses,
            values256,
            values32
        );

        require(loanOffering.lender == msg.sender);
        require(loanOffering.expirationTimestamp > block.timestamp);

        uint remainingAmount = sub(
            loanOffering.rates.maxAmount,
            getUnavailableLoanOfferingAmountImpl(loanOffering.loanHash)
        );
        uint amountToCancel = min256(remainingAmount, cancelAmount);

        // If the loan was already fully canceled, then just return 0 amount was canceled
        if (amountToCancel == 0) {
            return 0;
        }

        loanCancels[loanOffering.loanHash] = add(
            loanCancels[loanOffering.loanHash],
            amountToCancel
        );

        LoanOfferingCanceled(
            loanOffering.loanHash,
            loanOffering.lender,
            loanOffering.feeRecipient,
            amountToCancel,
            block.timestamp
        );

        return amountToCancel;
    }

    // ------ Parsing Functions ------

    function parseLoanOffering(
        address[7] addresses,
        uint[9] values,
        uint32[3] values32
    )
        internal
        view
        returns (LoanOffering _loanOffering)
    {
        LoanOffering memory loanOffering = LoanOffering({
            lender: addresses[2],
            taker: addresses[3],
            feeRecipient: addresses[4],
            lenderFeeToken: addresses[5],
            takerFeeToken: addresses[6],
            rates: parseLoanOfferRates(values),
            expirationTimestamp: values[7],
            lockoutTime: values32[0],
            callTimeLimit: values32[1],
            maxDuration: values32[2],
            salt: values[8],
            loanHash: 0,
            signature: Signature({
                v: 0,
                r: "0x",
                s: "0x"
            })
        });

        loanOffering.loanHash = getLoanOfferingHash(
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
        returns (LoanRates _loanRates)
    {
        LoanRates memory rates = LoanRates({
            minimumDeposit: values[0],
            maxAmount: values[1],
            minAmount: values[2],
            minimumSellAmount: values[3],
            interestRate: values[4],
            lenderFee: values[5],
            takerFee: values[6]
        });

        return rates;
    }
}
