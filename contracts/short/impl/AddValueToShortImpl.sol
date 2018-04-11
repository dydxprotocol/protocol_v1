pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { AddressUtils } from "zeppelin-solidity/contracts/AddressUtils.sol";
import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { ShortSellCommon } from "./ShortSellCommon.sol";
import { ShortSellState } from "./ShortSellState.sol";
import { ShortShared } from "./ShortShared.sol";
import { Vault } from "../Vault.sol";
import { MathHelpers } from "../../lib/MathHelpers.sol";
import { LoanOwner } from "../interfaces/LoanOwner.sol";
import { ExchangeWrapper } from "../interfaces/ExchangeWrapper.sol";
import { ShortOwner } from "../interfaces/ShortOwner.sol";


/**
 * @title AddValueToShortImpl
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
        address shortOwner,
        address loanOwner,
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
        bool depositInQuoteToken,
        bytes orderData
    )
        public
        returns (uint256)
    {
        ShortSellCommon.Short storage short = ShortSellCommon.getShortObject(state, shortId);

        ShortShared.ShortTx memory transaction = parseAddValueToShortTx(
            short,
            addresses,
            values256,
            values32,
            sigV,
            sigRS,
            depositInQuoteToken
        );

        uint256 quoteTokenFromSell = preStateUpdate(
            state,
            transaction,
            short,
            shortId,
            orderData
        );

        updateState(
            short,
            shortId,
            transaction.effectiveAmount,
            transaction.loanOffering.payer
        );

        // Update global amounts for the loan
        state.loanFills[transaction.loanOffering.loanHash] =
            state.loanFills[transaction.loanOffering.loanHash].add(transaction.effectiveAmount);

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
            quoteTokenFromSell
        );

        return transaction.lenderAmount;
    }

    function addValueToShortDirectlyImpl(
        ShortSellState.State storage state,
        bytes32 shortId,
        uint256 amount
    )
        public
        returns (uint256)
    {
        ShortSellCommon.Short storage short = ShortSellCommon.getShortObject(state, shortId);

        uint256 quoteTokenAmount = getPositionMinimumQuoteToken(
            shortId,
            state,
            amount,
            short
        );

        Vault(state.VAULT).transferToVault(
            shortId,
            short.quoteToken,
            msg.sender,
            quoteTokenAmount
        );

        updateState(
            short,
            shortId,
            amount,
            msg.sender
        );

        emit ValueAddedToShort(
            shortId,
            msg.sender,
            msg.sender,
            short.seller,
            short.lender,
            "",
            address(0),
            0,
            amount,
            0,
            quoteTokenAmount
        );

        return quoteTokenAmount;
    }

    // --------- Helper Functions ---------

    function preStateUpdate(
        ShortSellState.State storage state,
        ShortShared.ShortTx transaction,
        ShortSellCommon.Short storage short,
        bytes32 shortId,
        bytes orderData
    )
        internal
        returns (uint256 /* quoteTokenFromSell */)
    {
        validate(transaction, short);
        uint256 positionMinimumQuoteToken = setDepositAmount(
            state,
            transaction,
            short,
            shortId,
            orderData
        );

        uint256 quoteTokenFromSell;
        uint256 totalQuoteTokenReceived;

        (quoteTokenFromSell, totalQuoteTokenReceived) = ShortShared.shortInternalPreStateUpdate(
            state,
            transaction,
            shortId,
            orderData
        );

        // This should always be true unless there is a faulty ExchangeWrapper (i.e. the
        // ExchangeWrapper traded at a different price from what it said it would)
        assert(positionMinimumQuoteToken == totalQuoteTokenReceived);

        return quoteTokenFromSell;
    }

    function validate(
        ShortShared.ShortTx transaction,
        ShortSellCommon.Short storage short
    )
        internal
        view
    {
        require(short.callTimeLimit <= transaction.loanOffering.callTimeLimit);

        // require the short to end no later than the loanOffering's maximum acceptable end time
        uint256 shortEndTimestamp = uint256(short.startTimestamp).add(short.maxDuration);
        uint256 offeringEndTimestamp = block.timestamp.add(transaction.loanOffering.maxDuration);
        require(shortEndTimestamp <= offeringEndTimestamp);

        // Do not allow value to be added after the max duration
        require(block.timestamp < shortEndTimestamp);
    }

    function setDepositAmount(
        ShortSellState.State storage state,
        ShortShared.ShortTx transaction,
        ShortSellCommon.Short storage short,
        bytes32 shortId,
        bytes orderData
    )
        internal
        view // Does modify transaction
        returns (uint256 /* positionMinimumQuoteToken */)
    {
        // Amount of quote token we need to add to the position to maintain the position's ratio
        // of quote token to base token
        uint256 positionMinimumQuoteToken = getPositionMinimumQuoteToken(
            shortId,
            state,
            transaction.effectiveAmount,
            short
        );

        if (transaction.depositInQuoteToken) {
            uint256 quoteTokenFromSell = ExchangeWrapper(transaction.exchangeWrapperAddress)
                .getTradeMakerTokenAmount(
                    transaction.quoteToken,
                    transaction.baseToken,
                    transaction.lenderAmount,
                    orderData
                );

            require(quoteTokenFromSell <= positionMinimumQuoteToken);
            transaction.depositAmount = positionMinimumQuoteToken.sub(quoteTokenFromSell);
        } else {
            uint256 baseTokenToSell = ExchangeWrapper(transaction.exchangeWrapperAddress)
                .getTakerTokenPrice(
                    transaction.quoteToken,
                    transaction.baseToken,
                    positionMinimumQuoteToken,
                    orderData
                );

            require(transaction.lenderAmount <= baseTokenToSell);
            transaction.depositAmount = baseTokenToSell.sub(transaction.lenderAmount);
        }

        return positionMinimumQuoteToken;
    }

    function getPositionMinimumQuoteToken(
        bytes32 shortId,
        ShortSellState.State storage state,
        uint256 effectiveAmount,
        ShortSellCommon.Short storage short
    )
        internal
        view
        returns (uint256)
    {
        uint256 quoteTokenBalance = Vault(state.VAULT).balances(shortId, short.quoteToken);

        return MathHelpers.getPartialAmountRoundedUp(
            effectiveAmount,
            short.shortAmount,
            quoteTokenBalance
        );
    }

    function updateState(
        ShortSellCommon.Short storage short,
        bytes32 shortId,
        uint256 effectiveAmount,
        address loanPayer
    )
        internal
    {
        short.shortAmount = short.shortAmount.add(effectiveAmount);

        address seller = short.seller;
        address lender = short.lender;

        // Unless msg.sender is the position short seller and is not a smart contract, call out
        // to the short seller to ensure they consent to value being added
        if (msg.sender != seller || AddressUtils.isContract(seller)) {
            require(
                ShortOwner(seller).additionalShortValueAdded(
                    msg.sender,
                    shortId,
                    effectiveAmount
                )
            );
        }

        // Unless the loan offering's lender is the owner of the loan position and is not a smart
        // contract, call out to the owner of the loan position to ensure they consent
        // to value being added
        if (loanPayer != lender || AddressUtils.isContract(lender)) {
            require(
                LoanOwner(lender).additionalLoanValueAdded(
                    loanPayer,
                    shortId,
                    effectiveAmount
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
            msg.sender,
            transaction.loanOffering.payer,
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
        bytes32[2] sigRS,
        bool depositInQuoteToken
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
            lenderAmount: ShortSellCommon.calculateLenderAmountForAddValue(
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
            exchangeWrapperAddress: addresses[6],
            depositInQuoteToken: depositInQuoteToken
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
        returns (ShortSellCommon.Signature memory)
    {
        ShortSellCommon.Signature memory signature = ShortSellCommon.Signature({
            v: sigV,
            r: sigRS[0],
            s: sigRS[1]
        });

        return signature;
    }
}
