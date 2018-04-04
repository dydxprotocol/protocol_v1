pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { ShortSellCommon } from "./ShortSellCommon.sol";
import { Vault } from "../Vault.sol";
import { MathHelpers } from "../../lib/MathHelpers.sol";
import { ShortSellState } from "./ShortSellState.sol";
import { ShortOwner } from "../interfaces/ShortOwner.sol";
import { LoanOwner } from "../interfaces/LoanOwner.sol";
import { ContractHelper } from "../../lib/ContractHelper.sol";
import { ShortShared } from "./ShortShared.sol";


/**
 * @title ShortImpl
 * @author dYdX
 *
 * This library contains the implementation for the addValueToShort function of ShortSell
 */
library AddValueToShortImpl {
    using SafeMath for uint256;

    // ------------------------
    // -------- Events --------
    // ------------------------

    /*
     * Value was added to a short sell
     */
    event ValueAddedToShort(
        bytes32 indexed id,
        address indexed shortSeller,
        address indexed lender,
        bytes32 loanHash,
        address loanFeeRecipient,
        uint256 amountBorrowed,
        uint256 effectiveAmountAdded,
        uint256 quoteTokenFromSell,
        uint256 depositAmount
    );

    // -------------------------------------------
    // ----- Public Implementation Functions -----
    // -------------------------------------------

    function addValueToShortImpl(
        ShortSellState.State storage state,
        bytes32 shortId,
        address[7] addresses,
        uint256[8] values256,
        uint32[2] values32,
        uint8 sigV,
        bytes32[2] sigRS,
        bytes orderData
    )
        public
        returns (uint256 _baseTokenPulledFromLender)
    {
        ShortSellCommon.Short storage short = ShortSellCommon.getShortObject(state, shortId);

        ShortShared.ShortTx memory transaction = parseAddValueToShortTx(
            short,
            addresses,
            values256,
            values32,
            sigV,
            sigRS
        );

        // Quote token balance before transfering anything for this addition
        // NOTE: this must be done before executing the sell in shortInternalPreStateUpdate
        uint256 positionMinimumQuoteToken = getPositionMinimumQuoteToken(
            shortId,
            state,
            transaction,
            short
        );

        uint256 quoteTokenReceived = ShortShared.shortInternalPreStateUpdate(
            state,
            transaction,
            shortId,
            orderData
        );

        validateAndSetDepositAmount(
            transaction,
            short,
            positionMinimumQuoteToken,
            quoteTokenReceived
        );

        ShortShared.validateMinimumQuoteToken(
            transaction,
            quoteTokenReceived
        );

        updateState(
            state,
            transaction,
            shortId,
            short
        );

        ShortShared.shortInternalPostStateUpdate(
            state,
            transaction,
            shortId
        );

        // LOG EVENT
        recordValueAddedToShort(
            transaction,
            shortId,
            short,
            quoteTokenReceived
        );

        return transaction.lenderAmount;
    }

    // --------- Helper Functions ---------

    function getPositionMinimumQuoteToken(
        bytes32 shortId,
        ShortSellState.State storage state,
        ShortShared.ShortTx transaction,
        ShortSellCommon.Short storage short
    )
        internal
        view
        returns (uint256)
    {
        uint256 quoteTokenBalance = Vault(state.VAULT).balances(shortId, transaction.quoteToken);

        return MathHelpers.getPartialAmountRoundedUp(
            transaction.effectiveAmount,
            short.shortAmount,
            quoteTokenBalance
        );
    }

    function validateAndSetDepositAmount(
        ShortShared.ShortTx transaction,
        ShortSellCommon.Short storage short,
        uint256 positionMinimumQuoteToken,
        uint256 quoteTokenReceived
    )
        internal
        view
    {
        require(quoteTokenReceived <= positionMinimumQuoteToken);

        uint256 positionTimeRemaining = uint256(short.maxDuration).sub(
            ShortSellCommon.calculatePositionTimeElapsed(short, block.timestamp));

        require(positionTimeRemaining <= transaction.loanOffering.maxDuration);
        require(short.callTimeLimit <= transaction.loanOffering.callTimeLimit);

        transaction.depositAmount = positionMinimumQuoteToken.sub(quoteTokenReceived);
    }

    function updateState(
        ShortSellState.State storage state,
        ShortShared.ShortTx transaction,
        bytes32 shortId,
        ShortSellCommon.Short storage short
    )
        internal
    {
        short.shortAmount = short.shortAmount.add(transaction.effectiveAmount);

        // Update global amounts for the loan and lender
        state.loanFills[transaction.loanOffering.loanHash] =
            state.loanFills[transaction.loanOffering.loanHash].add(transaction.effectiveAmount);

        address seller = short.seller;
        address lender = short.lender;

        // Unless msg.sender is the position short seller and is not a smart contract, call out
        // to the short seller to ensure they consent to value being added
        if (msg.sender != seller || ContractHelper.isContract(seller)) {
            require(
                ShortOwner(seller).additionalShortValueAdded(
                    msg.sender,
                    shortId,
                    transaction.effectiveAmount
                )
            );
        }

        // Unless the loan offering's lender is the owner of the loan position and is not a smart
        // contract, call out to the owner of the loan position to ensure they consent
        // to value being added
        if (transaction.loanOffering.payer != lender || ContractHelper.isContract(lender)) {
            require(
                LoanOwner(lender).additionalLoanValueAdded(
                    transaction.loanOffering.payer,
                    shortId,
                    transaction.effectiveAmount
                )
            );
        }
    }

    function recordValueAddedToShort(
        ShortShared.ShortTx transaction,
        bytes32 shortId,
        ShortSellCommon.Short storage short,
        uint256 quoteTokenFromSell
    )
        internal
    {
        emit ValueAddedToShort(
            shortId,
            short.seller,
            short.lender,
            transaction.loanOffering.loanHash,
            transaction.loanOffering.feeRecipient,
            transaction.lenderAmount,
            transaction.effectiveAmount,
            quoteTokenFromSell,
            transaction.depositAmount
        );
    }

    // -------- Parsing Functions -------

    function parseAddValueToShortTx(
        ShortSellCommon.Short storage short,
        address[7] addresses,
        uint256[8] values256,
        uint32[2] values32,
        uint8 sigV,
        bytes32[2] sigRS
    )
        internal
        view
        returns (ShortShared.ShortTx memory)
    {
        ShortShared.ShortTx memory transaction = ShortShared.ShortTx({
            owner: short.seller,
            baseToken: short.baseToken,
            quoteToken: short.quoteToken,
            effectiveAmount: values256[7],
            lenderAmount: ShortSellCommon.calculateOwedAmount(
                short,
                values256[7],
                block.timestamp
            ),
            depositAmount: 0,
            loanOffering: parseLoanOfferingFromAddValueTx(
                short,
                addresses,
                values256,
                values32,
                sigV,
                sigRS
            ),
            exchangeWrapperAddress: addresses[6]
        });

        return transaction;
    }

    function parseLoanOfferingFromAddValueTx(
        ShortSellCommon.Short storage short,
        address[7] addresses,
        uint256[8] values256,
        uint32[2] values32,
        uint8 sigV,
        bytes32[2] sigRS
    )
        internal
        view
        returns (ShortSellCommon.LoanOffering memory)
    {
        ShortSellCommon.LoanOffering memory loanOffering = ShortSellCommon.LoanOffering({
            payer: addresses[0],
            signer: addresses[1],
            owner: short.lender,
            taker: addresses[2],
            feeRecipient: addresses[3],
            lenderFeeToken: addresses[4],
            takerFeeToken: addresses[5],
            rates: parseLoanOfferingRatesFromAddValueTx(short, values256),
            expirationTimestamp: values256[5],
            callTimeLimit: values32[0],
            maxDuration: values32[1],
            salt: values256[6],
            loanHash: 0,
            signature: parseLoanOfferingSignature(sigV, sigRS)
        });

        loanOffering.loanHash = ShortSellCommon.getLoanOfferingHash(
            loanOffering,
            short.quoteToken,
            short.baseToken
        );

        return loanOffering;
    }

    function parseLoanOfferingRatesFromAddValueTx(
        ShortSellCommon.Short storage short,
        uint256[8] values256
    )
        internal
        view
        returns (ShortSellCommon.LoanRates memory)
    {
        ShortSellCommon.LoanRates memory rates = ShortSellCommon.LoanRates({
            maxAmount: values256[0],
            minAmount: values256[1],
            minQuoteToken: values256[2],
            interestRate: short.interestRate,
            lenderFee: values256[3],
            takerFee: values256[4],
            interestPeriod: short.interestPeriod
        });

        return rates;
    }

    function parseLoanOfferingSignature(
        uint8 sigV,
        bytes32[2] sigRS
    )
        internal
        pure
        returns (ShortSellCommon.Signature _signature)
    {
        ShortSellCommon.Signature memory signature = ShortSellCommon.Signature({
            v: sigV,
            r: sigRS[0],
            s: sigRS[1]
        });

        return signature;
    }
}
