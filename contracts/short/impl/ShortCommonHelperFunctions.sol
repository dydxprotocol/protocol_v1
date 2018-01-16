pragma solidity 0.4.18;

import { ShortSellState } from "./ShortSellState.sol";
import { Vault } from "../Vault.sol";
import { ShortSellRepo } from "../ShortSellRepo.sol";
import { ShortSellAuctionRepo } from "../ShortSellAuctionRepo.sol";
import { SafeMath } from "../../lib/SafeMath.sol";


/**
 * @title ShortCommonHelperFunctions
 * @author Antonio Juliano
 *
 * This contract contains common functions for implementations of public facing ShortSell functions
 */
contract ShortCommonHelperFunctions is SafeMath, ShortSellState {
    // -----------------------
    // ------- Structs -------
    // -----------------------

    struct Short {
        address underlyingToken;
        address baseToken;
        uint shortAmount;
        uint closedAmount;
        uint interestRate;
        uint32 callTimeLimit;
        uint32 lockoutTime;
        uint32 startTimestamp;
        uint32 callTimestamp;
        address lender;
        address seller;
    }

    struct LoanOffering {
        address lender;
        address taker;
        address feeRecipient;
        address lenderFeeToken;
        address takerFeeToken;
        LoanRates rates;
        uint expirationTimestamp;
        uint32 lockoutTime;
        uint32 callTimeLimit;
        uint salt;
        bytes32 loanHash;
        Signature signature;
    }

    struct LoanRates {
        uint minimumDeposit;
        uint minimumSellAmount;
        uint maxAmount;
        uint minAmount;
        uint interestRate;
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
        bytes32 loanHash
    )
        view
        internal
        returns (uint _unavailableAmount)
    {
        return add(loanFills[loanHash], loanCancels[loanHash]);
    }

    function transferToCloseVault(
        Short short,
        bytes32 shortId,
        uint closeAmount
    )
        internal
        returns (bytes32 _closeId)
    {
        uint currentShortAmount = sub(short.shortAmount, short.closedAmount);

        // The maximum amount of base token that can be used by this close
        uint baseTokenShare = getPartialAmount(
            closeAmount,
            currentShortAmount,
            Vault(VAULT).balances(shortId, short.baseToken)
        );

        bytes32 closeId = keccak256(shortId, "CLOSE");
        Vault(VAULT).transferBetweenVaults(
            shortId,
            closeId,
            short.baseToken,
            baseTokenShare
        );

        return closeId;
    }

    function cleanupShort(
        bytes32 shortId
    )
        internal
    {
        ShortSellRepo(REPO).deleteShort(shortId);
    }

    function payBackAuctionBidderIfExists(
        bytes32 shortId,
        Short short
    )
        internal
    {
        ShortSellAuctionRepo repo = ShortSellAuctionRepo(AUCTION_REPO);
        Vault vault = Vault(VAULT);

        var (, currentBidder, hasCurrentOffer) = repo.getAuction(shortId);

        if (!hasCurrentOffer) {
            return;
        }

        repo.deleteAuctionOffer(shortId);

        vault.send(
            shortId,
            short.underlyingToken,
            currentBidder,
            vault.balances(getAuctionVaultId(shortId), short.underlyingToken)
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
        // The interest rate for the proportion of the position being closed
        uint interestRate = getPartialAmount(
            closeAmount,
            short.shortAmount,
            short.interestRate
        );

        uint timeElapsed = sub(endTimestamp, short.startTimestamp);
        // TODO implement more complex interest rates
        return getPartialAmount(timeElapsed, 1 days, interestRate);
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
            loanOffering.rates.interestRate,
            loanOffering.rates.lenderFee,
            loanOffering.rates.takerFee,
            loanOffering.expirationTimestamp,
            loanOffering.lockoutTime,
            loanOffering.callTimeLimit,
            loanOffering.salt
        );
    }

    // -------- Parsing Functions -------

    function getShortObject(
        bytes32 shortId
    )
        internal
        view
        returns (Short _short)
    {
        var (
            underlyingToken,
            baseToken,
            shortAmount,
            closedAmount,
            interestRate,
            callTimeLimit,
            lockoutTime,
            startTimestamp,
            callTimestamp,
            lender,
            seller
        ) =  ShortSellRepo(REPO).getShort(shortId);

        // This checks that the short exists
        require(startTimestamp != 0);

        return Short({
            underlyingToken: underlyingToken,
            baseToken: baseToken,
            shortAmount: shortAmount,
            closedAmount: closedAmount,
            interestRate: interestRate,
            callTimeLimit: callTimeLimit,
            lockoutTime: lockoutTime,
            startTimestamp: startTimestamp,
            callTimestamp: callTimestamp,
            lender: lender,
            seller: seller
        });
    }
}
