pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { InterestImpl } from "./InterestImpl.sol";
import { ShortSellState } from "./ShortSellState.sol";
import { MathHelpers } from "../../lib/MathHelpers.sol";
import { Math } from "zeppelin-solidity/contracts/math/Math.sol";
import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";


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
        address baseToken;       // Immutable
        address quoteToken;      // Immutable
        address lender;
        address seller;
        uint256 shortAmount;
        uint256 closedAmount;
        uint256 requiredDeposit;
        uint32  callTimeLimit;   // Immutable
        uint32  startTimestamp;  // Immutable, cannot be 0
        uint32  callTimestamp;
        uint32  maxDuration;     // Immutable
        uint32  interestRate;    // Immutable
        uint32  interestPeriod;  // Immutable
    }

    struct LoanOffering {
        address   payer;
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
        uint256 minQuoteToken;
        uint256 lenderFee;
        uint256 takerFee;
        uint32  interestRate;
        uint32  interestPeriod;
    }

    struct Signature {
        uint8 v;
        bytes32 r;
        bytes32 s;
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
        returns (uint256)
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

    function calculateOwedAmount(
        Short short,
        uint256 closeAmount,
        uint256 endTimestamp
    )
        internal
        pure
        returns (uint256)
    {
        uint256 timeElapsed = calculateEffectiveTimeElapsed(short, endTimestamp);

        return InterestImpl.getCompoundedInterest(
            closeAmount,
            short.interestRate,
            timeElapsed
        );
    }

    /**
     * Calculates time elapsed rounded up to the nearest interestPeriod
     */
    function calculateEffectiveTimeElapsed(
        Short short,
        uint256 timestamp
    )
        internal
        pure
        returns (uint256)
    {
        uint256 elapsed = timestamp.sub(short.startTimestamp);

        // round up to interestPeriod
        uint256 period = short.interestPeriod;
        if (period > 1) {
            elapsed = MathHelpers.divisionRoundedUp(elapsed, period).mul(period);
        }

        // bound by maxDuration
        return Math.min256(
            elapsed,
            short.maxDuration
        );
    }

    function calculateLenderAmountForAddValue(
        Short short,
        uint256 addAmount,
        uint256 endTimestamp
    )
        internal
        pure
        returns (uint256)
    {
        uint256 timeElapsed = calculateEffectiveTimeElapsedForNewLender(short, endTimestamp);

        return InterestImpl.getCompoundedInterest(
            addAmount,
            short.interestRate,
            timeElapsed
        );
    }

    /**
     * Calculates time elapsed rounded down to the nearest interestPeriod
     */
    function calculateEffectiveTimeElapsedForNewLender(
        Short short,
        uint256 timestamp
    )
        internal
        pure
        returns (uint256)
    {
        uint256 elapsed = timestamp.sub(short.startTimestamp);

        // round down to interestPeriod
        uint256 period = short.interestPeriod;
        if (period > 1) {
            elapsed = elapsed.div(period).mul(period);
        }

        // bound by maxDuration
        return Math.min256(
            elapsed,
            short.maxDuration
        );
    }

    function getLoanOfferingHash(
        LoanOffering loanOffering,
        address quoteToken,
        address baseToken
    )
        internal
        view
        returns (bytes32)
    {
        return keccak256(
            address(this),
            baseToken,
            quoteToken,
            loanOffering.payer,
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
        returns (bytes32)
    {
        return keccak256(
            loanOffering.rates.maxAmount,
            loanOffering.rates.minAmount,
            loanOffering.rates.minQuoteToken,
            loanOffering.rates.lenderFee,
            loanOffering.rates.takerFee,
            loanOffering.expirationTimestamp,
            loanOffering.salt,
            loanOffering.callTimeLimit,
            loanOffering.maxDuration,
            loanOffering.rates.interestRate,
            loanOffering.rates.interestPeriod
        );
    }

    function containsShortImpl(
        ShortSellState.State storage state,
        bytes32 id
    )
        view
        internal
        returns (bool)
    {
        return state.shorts[id].startTimestamp != 0;
    }

    function getShortObject(
        ShortSellState.State storage state,
        bytes32 shortId
    )
        internal
        view
        returns (Short storage)
    {
        Short storage short = state.shorts[shortId];

        // This checks that the short exists
        require(short.startTimestamp != 0);

        return short;
    }
}
