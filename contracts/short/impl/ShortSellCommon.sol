pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { Math } from "zeppelin-solidity/contracts/math/Math.sol";
import { ShortSellState } from "./ShortSellState.sol";
import { Vault } from "../Vault.sol";
import { LoanOwner } from "../interfaces/LoanOwner.sol";
import { ShortOwner } from "../interfaces/ShortOwner.sol";
import { ContractHelper } from "../../lib/ContractHelper.sol";
import { MathHelpers } from "../../lib/MathHelpers.sol";
import { CloseShortDelegator } from "../interfaces/CloseShortDelegator.sol";
import { InterestImpl } from "./InterestImpl.sol";


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
        address underlyingToken;    // Immutable
        address baseToken;          // Immutable
        uint256 shortAmount;
        uint256 closedAmount;
        uint256 interestRate; // Immutable
        uint256 requiredDeposit;
        uint32  callTimeLimit;      // Immutable
        uint32  startTimestamp;     // Immutable, cannot be 0
        uint32  callTimestamp;
        uint32  maxDuration;        // Immutable
        uint32  interestPeriod;  // Immutable
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
        uint256 interestRate;
        uint256 lenderFee;
        uint256 takerFee;
        uint32  interestPeriod;
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

    function calculateOwedAmount(
        Short short,
        uint256 closeAmount,
        uint256 endTimestamp
    )
        internal
        pure
        returns (uint256 _interestFee)
    {
        uint256 timeElapsed = calculatePositionTimeElapsed(short, endTimestamp);

        return InterestImpl.getCompoundedInterest(
            closeAmount,
            short.interestRate,
            timeElapsed,
            short.interestPeriod
        );
    }

    function calculatePositionTimeElapsed(
        Short short,
        uint256 endTimestamp
    )
        internal
        pure
        returns (uint256 _timeElapsed)
    {
        uint256 boundedEndTimestamp = endTimestamp;
        if (short.callTimestamp > 0) {
            boundedEndTimestamp = Math.min256(
                endTimestamp,
                uint256(short.callTimestamp).add(short.callTimeLimit)
            );
        }
        return Math.min256(
            short.maxDuration,
            boundedEndTimestamp.sub(short.startTimestamp)
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
            loanOffering.rates.interestRate,
            loanOffering.rates.lenderFee,
            loanOffering.rates.takerFee,
            loanOffering.rates.interestPeriod,
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
