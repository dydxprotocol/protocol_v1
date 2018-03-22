pragma solidity 0.4.19;

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { Math } from "zeppelin-solidity/contracts/math/Math.sol";
import { ShortSellState } from "./ShortSellState.sol";
import { Vault } from "../Vault.sol";
import { LoanOwner } from "../interfaces/LoanOwner.sol";
import { ShortOwner } from "../interfaces/ShortOwner.sol";
import { ContractHelper } from "../../lib/ContractHelper.sol";
import { MathHelpers } from "../../lib/MathHelpers.sol";
import { CloseShortDelegator } from "../interfaces/CloseShortDelegator.sol";

/**
 * @title ShortSellCommon
 * @author dYdX
 *
 * This library contains common functions for implementations of public facing ShortSell functions
 */
library ShortSellCommon {
    using SafeMath for uint256;

    // -----------------------
    // ------- Structs -------
    // -----------------------

    struct Short {
        address underlyingToken; // Immutable
        address baseToken;       // Immutable
        uint256 shortAmount;
        uint256 closedAmount;
        uint256 interestRate;
        uint256 requiredDeposit;
        uint32  callTimeLimit;
        uint32  startTimestamp;   // Immutable, cannot be 0
        uint32  callTimestamp;
        uint32  maxDuration;
        address lender;
        address seller;
    }

    struct LoanOffering {
        address   lender;
        address   signer;
        address   owner;
        address   taker;
        address   feeRecipient;
        address   lenderFeeToken;
        address   takerFeeToken;
        LoanRates rates;
        uint256   expirationTimestamp;
        uint32    callTimeLimit;
        uint32    maxDuration;
        uint256   salt;
        bytes32   loanHash;
        Signature signature;
    }

    struct LoanRates {
        uint256 maxAmount;
        uint256 minAmount;
        uint256 minBaseToken;
        uint256 dailyInterestFee;
        uint256 lenderFee;
        uint256 takerFee;
    }

    struct Signature {
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    struct CloseShortTx {
        Short short;
        uint256 currentShortAmount;
        bytes32 shortId;
        uint256 closeAmount;
        uint256 availableBaseToken;
        uint256 startingBaseToken;
        address payoutRecipient;
    }

    // -------------------------------------------
    // ---- Internal Implementation Functions ----
    // -------------------------------------------

    function getUnavailableLoanOfferingAmountImpl(
        ShortSellState.State storage state,
        bytes32 loanHash
    )
        view
        internal
        returns (uint256 _unavailableAmount)
    {
        return state.loanFills[loanHash].add(state.loanCancels[loanHash]);
    }

    function cleanupShort(
        ShortSellState.State storage state,
        bytes32 shortId
    )
        internal
    {
        delete state.shorts[shortId];
        state.closedShorts[shortId] = true;
    }

    function calculateInterestFee(
        Short short,
        uint256 closeAmount,
        uint256 endTimestamp
    )
        internal
        pure
        returns (uint256 _interestFee)
    {
        uint256 timeElapsed = endTimestamp.sub(short.startTimestamp);
        if (timeElapsed > short.maxDuration) {
            timeElapsed = short.maxDuration;
        }

        // Round up to disincentivize taking out smaller shorts in order to make reduced interest
        // payments. This would be an infeasiable attack in most scenarios due to low rounding error
        // and high transaction/gas fees, but is nonetheless theoretically possible.
        return MathHelpers.getQuotient3Over2RoundedUp(
            closeAmount, timeElapsed, short.interestRate, // numerators
            short.shortAmount, 1 days                     // denominators
        );
    }

    function getLoanOfferingHash(
        LoanOffering loanOffering,
        address baseToken,
        address underlyingToken
    )
        internal
        view
        returns (bytes32 _hash)
    {
        return keccak256(
            address(this),
            underlyingToken,
            baseToken,
            loanOffering.lender,
            loanOffering.signer,
            loanOffering.owner,
            loanOffering.taker,
            loanOffering.feeRecipient,
            loanOffering.lenderFeeToken,
            loanOffering.takerFeeToken,
            getValuesHash(loanOffering)
        );
    }

    function getValuesHash(
        LoanOffering loanOffering
    )
        internal
        pure
        returns (bytes32 _hash)
    {
        return keccak256(
            loanOffering.rates.maxAmount,
            loanOffering.rates.minAmount,
            loanOffering.rates.minBaseToken,
            loanOffering.rates.dailyInterestFee,
            loanOffering.rates.lenderFee,
            loanOffering.rates.takerFee,
            loanOffering.expirationTimestamp,
            loanOffering.callTimeLimit,
            loanOffering.maxDuration,
            loanOffering.salt
        );
    }

    function containsShortImpl(
        ShortSellState.State storage state,
        bytes32 id
    )
        view
        internal
        returns (bool exists)
    {
        return state.shorts[id].startTimestamp != 0;
    }

    function getShortObject(
        ShortSellState.State storage state,
        bytes32 shortId
    )
        internal
        view
        returns (Short storage _short)
    {
        Short storage short = state.shorts[shortId];

        // This checks that the short exists
        require(short.startTimestamp != 0);

        return short;
    }

    function parseCloseShortTx(
        ShortSellState.State storage state,
        bytes32 shortId,
        uint256 requestedCloseAmount,
        address payoutRecipient
    )
        internal
        view
        returns (CloseShortTx memory _tx)
    {
        Short storage short = getShortObject(state, shortId);
        uint256 currentShortAmount = short.shortAmount.sub(short.closedAmount);
        uint256 closeAmount = Math.min256(requestedCloseAmount, currentShortAmount);
        uint256 startingBaseToken = Vault(state.VAULT).balances(shortId, short.baseToken);
        uint256 availableBaseToken = MathHelpers.getPartialAmount(
            closeAmount,
            currentShortAmount,
            startingBaseToken
        );

        return CloseShortTx({
            short: short,
            currentShortAmount: currentShortAmount,
            shortId: shortId,
            closeAmount: closeAmount,
            availableBaseToken: availableBaseToken,
            startingBaseToken: startingBaseToken,
            payoutRecipient: (payoutRecipient == address(0)) ? msg.sender : payoutRecipient
        });
    }

    // --------- Helper Functions ---------

    /**
     * Validate the CloseShortTx object created for closing a short.
     * This function may throw, or it may simply modify parameters of the CloseShortTx object.
     * Will not throw if the resulting object is valid.
     * @param transaction  The transaction to validate
     */
    function validateCloseShortTx(
        CloseShortTx transaction
    )
        internal
    {
        // If not the short seller, requires short seller to approve msg.sender
        if (transaction.short.seller != msg.sender) {
            uint256 allowedCloseAmount =
                CloseShortDelegator(transaction.short.seller).closeOnBehalfOf(
                    msg.sender,
                    transaction.payoutRecipient,
                    transaction.shortId,
                    transaction.closeAmount
                );

            // Because the verifier may do accounting based on the number that it returns, revert
            // if the returned amount is larger than the remaining amount of the short.
            require(transaction.closeAmount >= allowedCloseAmount);
            transaction.closeAmount = allowedCloseAmount;
        }

        require(transaction.closeAmount > 0);
        require(transaction.closeAmount <= transaction.currentShortAmount);
    }

    function updateClosedAmount(
        ShortSellState.State storage state,
        CloseShortTx transaction
    )
        internal
    {
        uint256 newClosedAmount = transaction.short.closedAmount.add(transaction.closeAmount);
        state.shorts[transaction.shortId].closedAmount = newClosedAmount;
    }
}
