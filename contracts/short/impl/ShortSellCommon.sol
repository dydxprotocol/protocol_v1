pragma solidity 0.4.19;

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { ShortSellState } from "./ShortSellState.sol";
import { Vault } from "../Vault.sol";
import { LoanOwner } from "../interfaces/LoanOwner.sol";
import { ShortOwner } from "../interfaces/ShortOwner.sol";
import { ContractHelper } from "../../lib/ContractHelper.sol";
import { MathHelpers } from "../../lib/MathHelpers.sol";


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
        uint256 minimumDeposit;
        uint256 minimumSellAmount;
        uint256 maxAmount;
        uint256 minAmount;
        uint256 dailyInterestFee;
        uint256 lenderFee;
        uint256 takerFee;
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
        returns (uint256 _unavailableAmount)
    {
        return state.loanFills[loanHash].add(state.loanCancels[loanHash]);
    }

    function transferToCloseVault(
        ShortSellState.State storage state,
        Short short,
        bytes32 shortId,
        uint256 closeAmount
    )
        internal
        returns (bytes32 _closeId)
    {
        uint256 currentShortAmount = short.shortAmount.sub(short.closedAmount);

        // The maximum amount of base token that can be used by this close
        uint256 baseTokenShare = MathHelpers.getPartialAmount(
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

    function getNewLoanOwner(
        bytes32 shortId,
        address oldOwner,
        address newOwner
    )
        internal
        returns (address _newOwner)
    {
        if (ContractHelper.isContract(newOwner)) {
            address nextOwner = LoanOwner(newOwner).recieveLoanOwnership(oldOwner, shortId);
            if (nextOwner != newOwner) {
                return getNewLoanOwner(shortId, newOwner, nextOwner);
            }
        }
        require (newOwner != address(0));
        return newOwner;
    }

    function getNewShortOwner(
        bytes32 shortId,
        address oldOwner,
        address newOwner
    )
        internal
        returns (address _newOwner)
    {
        if (ContractHelper.isContract(newOwner)) {
            address nextOwner = ShortOwner(newOwner).recieveShortOwnership(oldOwner, shortId);
            if (nextOwner != newOwner) {
                return getNewShortOwner(shortId, newOwner, nextOwner);
            }
        }
        require (newOwner != address(0));
        return newOwner;
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
}
