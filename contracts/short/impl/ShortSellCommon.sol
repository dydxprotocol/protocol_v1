pragma solidity 0.4.19;

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { ShortSellState } from "./ShortSellState.sol";
import { Vault } from "../vault/Vault.sol";
import { ShortSellAuctionRepo } from "../ShortSellAuctionRepo.sol";
import { MathHelpers } from "../../lib/MathHelpers.sol";


/**
 * @title ShortSellCommon
 * @author dYdX
 *
 * This library contains common functions for implementations of public facing ShortSell functions
 */
library ShortSellCommon {
    using SafeMath for uint;

    // -----------------------
    // ------- Structs -------
    // -----------------------

    struct Short {
        address underlyingToken; // Immutable
        address baseToken;       // Immutable
        uint shortAmount;
        uint closedAmount;
        uint interestRate;
        uint32 callTimeLimit;
        uint32 startTimestamp;   // Immutable, cannot be 0
        uint32 callTimestamp;
        uint32 maxDuration;
        address lender;
        address seller;
    }

    struct LoanOffering {
        address lender;
        address signer;
        address taker;
        address feeRecipient;
        address lenderFeeToken;
        address takerFeeToken;
        LoanRates rates;
        uint expirationTimestamp;
        uint32 callTimeLimit;
        uint32 maxDuration;
        uint salt;
        bytes32 loanHash;
        Signature signature;
    }

    struct LoanRates {
        uint minimumDeposit;
        uint minimumSellAmount;
        uint maxAmount;
        uint minAmount;
        uint dailyInterestFee;
        uint lenderFee;
        uint takerFee;
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
        returns (uint _unavailableAmount)
    {
        return state.loanFills[loanHash].add(state.loanCancels[loanHash]);
    }

    function transferToCloseVault(
        ShortSellState.State storage state,
        Short short,
        bytes32 shortId,
        uint closeAmount
    )
        internal
        returns (bytes32 _closeId)
    {
        uint currentShortAmount = short.shortAmount.sub(short.closedAmount);

        // The maximum amount of base token that can be used by this close
        uint baseTokenShare = MathHelpers.getPartialAmount(
            closeAmount,
            currentShortAmount,
            Vault(state.VAULT).balances(shortId, short.baseToken)
        );

        bytes32 closeId = keccak256(shortId, "CLOSE");
        Vault(state.VAULT).transferBetweenVaults(
            shortId,
            closeId,
            short.baseToken,
            baseTokenShare
        );

        return closeId;
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

    function payBackAuctionBidderIfExists(
        ShortSellState.State storage state,
        bytes32 shortId,
        Short short
    )
        internal
    {
        ShortSellAuctionRepo repo = ShortSellAuctionRepo(state.AUCTION_REPO);
        Vault vault = Vault(state.VAULT);

        var (, currentBidder, hasCurrentOffer) = repo.getAuction(shortId);

        if (!hasCurrentOffer) {
            return;
        }

        repo.deleteAuctionOffer(shortId);

        bytes32 auctionVaultId = getAuctionVaultId(shortId);

        vault.transferToSafetyDepositBox(
            auctionVaultId,
            short.underlyingToken,
            currentBidder,
            vault.balances(auctionVaultId, short.underlyingToken)
        );
    }

    function getAuctionVaultId(
        bytes32 shortId
    )
        internal
        pure
        returns (bytes32 _auctionVaultId)
    {
        return keccak256(shortId, "AUCTION_VAULT");
    }

    function calculateInterestFee(
        Short short,
        uint closeAmount,
        uint endTimestamp
    )
        internal
        pure
        returns (uint _interestFee)
    {
        uint timeElapsed = endTimestamp.sub(short.startTimestamp);
        if (short.callTimestamp > 0 &&
            timeElapsed > uint(short.callTimestamp).add(short.callTimeLimit)
        ) {
            timeElapsed = uint(short.callTimestamp).add(short.callTimeLimit);
        }
        if (timeElapsed > short.maxDuration) {
            timeElapsed = short.maxDuration;
        }

        // We multiply everything before dividing to reduce rounding error as much as possible.
        // Overflow should have been prevented by the loan verification already.
        // const proratedInterest = interestRate * (close Amount / short.shortAmount)
        // return proratedInterest * (timeElapsed / 1 days);
        uint numerator = short.interestRate.mul(closeAmount).mul(timeElapsed);
        uint denominator = short.shortAmount.mul(1 days);
        return numerator.div(denominator);
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
            loanOffering.rates.minimumDeposit,
            loanOffering.rates.maxAmount,
            loanOffering.rates.minAmount,
            loanOffering.rates.minimumSellAmount,
            loanOffering.rates.dailyInterestFee,
            loanOffering.rates.lenderFee,
            loanOffering.rates.takerFee,
            loanOffering.expirationTimestamp,
            loanOffering.callTimeLimit,
            loanOffering.maxDuration,
            loanOffering.salt
        );
    }

    function getShortEndTimestamp(
        Short short
    )
        internal
        pure
        returns (uint _endTimestamp)
    {
        // If the maxDuration is 0, then this short should never expire so return maximum int
        if (short.maxDuration == 0) {
            return 2 ** 256 - 1;
        }

        return uint(short.startTimestamp).add(uint(short.maxDuration));
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

    // -------- Parsing Functions -------

    function getShort(
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
}
