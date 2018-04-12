pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { AddressUtils } from "zeppelin-solidity/contracts/AddressUtils.sol";
import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { MarginCommon } from "./MarginCommon.sol";
import { MarginState } from "./MarginState.sol";
import { OpenPositionShared } from "./OpenPositionShared.sol";
import { Vault } from "../Vault.sol";
import { MathHelpers } from "../../lib/MathHelpers.sol";
import { ExchangeWrapper } from "../interfaces/ExchangeWrapper.sol";
import { LenderOwner } from "../interfaces/LenderOwner.sol";
import { TraderOwner } from "../interfaces/TraderOwner.sol";


/**
 * @title IncreasePositionImpl
 * @author dYdX
 *
 * This library contains the implementation for the increasePosition function of Margin
 */
library IncreasePositionImpl {
    using SafeMath for uint256;

    // ============ Events ============

    /*
     * Value was added to a margin position
     */
    event PositionIncreased(
        bytes32 indexed marginId,
        address indexed trader,
        address indexed lender,
        address traderOwner,
        address lenderOwner,
        bytes32 loanHash,
        address loanFeeRecipient,
        uint256 amountBorrowed,
        uint256 effectiveAmountAdded,
        uint256 quoteTokenFromSell,
        uint256 depositAmount
    );

    // ============ Public Implementation Functions ============

    function increasePositionImpl(
        MarginState.State storage state,
        bytes32 marginId,
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
        MarginCommon.Position storage position = MarginCommon.getPositionObject(state, marginId);

        OpenPositionShared.OpenPositionTx memory transaction = parseIncreasePositionTx(
            position,
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
            position,
            marginId,
            orderData
        );

        updateState(
            position,
            marginId,
            transaction.effectiveAmount,
            transaction.loanOffering.payer
        );

        // Update global amounts for the loan
        state.loanFills[transaction.loanOffering.loanHash] =
            state.loanFills[transaction.loanOffering.loanHash].add(transaction.effectiveAmount);

        OpenPositionShared.internalPostStateUpdate(
            state,
            transaction,
            marginId
        );

        // LOG EVENT
        recordPositionIncreased(
            transaction,
            marginId,
            position,
            quoteTokenFromSell
        );

        return transaction.lenderAmount;
    }

    function increasePositionDirectlyImpl(
        MarginState.State storage state,
        bytes32 marginId,
        uint256 amount
    )
        public
        returns (uint256)
    {
        MarginCommon.Position storage position = MarginCommon.getPositionObject(state, marginId);

        uint256 quoteTokenAmount = getPositionMinimumQuoteToken(
            marginId,
            state,
            amount,
            position
        );

        Vault(state.VAULT).transferToVault(
            marginId,
            position.quoteToken,
            msg.sender,
            quoteTokenAmount
        );

        updateState(
            position,
            marginId,
            amount,
            msg.sender
        );

        emit PositionIncreased(
            marginId,
            msg.sender,
            msg.sender,
            position.trader,
            position.lender,
            "",
            address(0),
            0,
            amount,
            0,
            quoteTokenAmount
        );

        return quoteTokenAmount;
    }

    // ============ Helper Functions ============

    function preStateUpdate(
        MarginState.State storage state,
        OpenPositionShared.OpenPositionTx transaction,
        MarginCommon.Position storage position,
        bytes32 marginId,
        bytes orderData
    )
        internal
        returns (uint256 /* quoteTokenFromSell */)
    {
        validate(transaction, position);
        uint256 positionMinimumQuoteToken = setDepositAmount(
            state,
            transaction,
            position,
            marginId,
            orderData
        );

        uint256 quoteTokenFromSell;
        uint256 totalQuoteTokenReceived;

        (quoteTokenFromSell, totalQuoteTokenReceived) = OpenPositionShared.internalPreStateUpdate(
            state,
            transaction,
            marginId,
            orderData
        );

        // This should always be true unless there is a faulty ExchangeWrapper (i.e. the
        // ExchangeWrapper traded at a different price from what it said it would)
        assert(positionMinimumQuoteToken == totalQuoteTokenReceived);

        return quoteTokenFromSell;
    }

    function validate(
        OpenPositionShared.OpenPositionTx transaction,
        MarginCommon.Position storage position
    )
        internal
        view
    {
        require(position.callTimeLimit <= transaction.loanOffering.callTimeLimit);

        // require the loan to end no later than the loanOffering's maximum acceptable end time
        uint256 positionEndTimestamp = uint256(position.startTimestamp).add(position.maxDuration);
        uint256 offeringEndTimestamp = block.timestamp.add(transaction.loanOffering.maxDuration);
        require(positionEndTimestamp <= offeringEndTimestamp);

        // Do not allow value to be added after the max duration
        require(block.timestamp < positionEndTimestamp);
    }

    function setDepositAmount(
        MarginState.State storage state,
        OpenPositionShared.OpenPositionTx transaction,
        MarginCommon.Position storage position,
        bytes32 marginId,
        bytes orderData
    )
        internal
        view // Does modify transaction
        returns (uint256 /* positionMinimumQuoteToken */)
    {
        // Amount of quote token we need to add to the position to maintain the position's ratio
        // of quote token to base token
        uint256 positionMinimumQuoteToken = getPositionMinimumQuoteToken(
            marginId,
            state,
            transaction.effectiveAmount,
            position
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
        bytes32 marginId,
        MarginState.State storage state,
        uint256 effectiveAmount,
        MarginCommon.Position storage position
    )
        internal
        view
        returns (uint256)
    {
        uint256 quoteTokenBalance = Vault(state.VAULT).balances(marginId, position.quoteToken);

        return MathHelpers.getPartialAmountRoundedUp(
            effectiveAmount,
            position.amount,
            quoteTokenBalance
        );
    }

    function updateState(
        MarginCommon.Position storage position,
        bytes32 marginId,
        uint256 effectiveAmount,
        address loanPayer
    )
        internal
    {
        position.amount = position.amount.add(effectiveAmount);

        address trader = position.trader;
        address lender = position.lender;

        // Unless msg.sender is the position margin trader and is not a smart contract, call out
        // to the margin trader to ensure they consent to value being added
        if (msg.sender != trader || AddressUtils.isContract(trader)) {
            require(
                TraderOwner(trader).marginPositionIncreased(
                    msg.sender,
                    marginId,
                    effectiveAmount
                )
            );
        }

        // Unless the loan offering's lender is the owner of the loan position and is not a smart
        // contract, call out to the owner of the loan position to ensure they consent
        // to value being added
        if (loanPayer != lender || AddressUtils.isContract(lender)) {
            require(
                LenderOwner(lender).loanIncreased(
                    loanPayer,
                    marginId,
                    effectiveAmount
                )
            );
        }
    }

    function recordPositionIncreased(
        OpenPositionShared.OpenPositionTx transaction,
        bytes32 marginId,
        MarginCommon.Position storage position,
        uint256 quoteTokenFromSell
    )
        internal
    {
        emit PositionIncreased(
            marginId,
            msg.sender,
            transaction.loanOffering.payer,
            position.trader,
            position.lender,
            transaction.loanOffering.loanHash,
            transaction.loanOffering.feeRecipient,
            transaction.lenderAmount,
            transaction.effectiveAmount,
            quoteTokenFromSell,
            transaction.depositAmount
        );
    }

    // ============ Parsing Functions ============

    function parseIncreasePositionTx(
        MarginCommon.Position storage position,
        address[7] addresses,
        uint256[8] values256,
        uint32[2] values32,
        uint8 sigV,
        bytes32[2] sigRS,
        bool depositInQuoteToken
    )
        internal
        view
        returns (OpenPositionShared.OpenPositionTx memory)
    {
        OpenPositionShared.OpenPositionTx memory transaction = OpenPositionShared.OpenPositionTx({
            owner: position.trader,
            baseToken: position.baseToken,
            quoteToken: position.quoteToken,
            effectiveAmount: values256[7],
            lenderAmount: MarginCommon.calculateLenderAmountForAddValue(
                position,
                values256[7],
                block.timestamp
            ),
            depositAmount: 0,
            loanOffering: parseLoanOfferingFromAddValueTx(
                position,
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
        MarginCommon.Position storage position,
        address[7] addresses,
        uint256[8] values256,
        uint32[2] values32,
        uint8 sigV,
        bytes32[2] sigRS
    )
        internal
        view
        returns (MarginCommon.LoanOffering memory)
    {
        MarginCommon.LoanOffering memory loanOffering = MarginCommon.LoanOffering({
            payer: addresses[0],
            signer: addresses[1],
            owner: position.lender,
            taker: addresses[2],
            feeRecipient: addresses[3],
            lenderFeeToken: addresses[4],
            takerFeeToken: addresses[5],
            rates: parseLoanOfferingRatesFromAddValueTx(position, values256),
            expirationTimestamp: values256[5],
            callTimeLimit: values32[0],
            maxDuration: values32[1],
            salt: values256[6],
            loanHash: 0,
            signature: parseLoanOfferingSignature(sigV, sigRS)
        });

        loanOffering.loanHash = MarginCommon.getLoanOfferingHash(
            loanOffering,
            position.quoteToken,
            position.baseToken
        );

        return loanOffering;
    }

    function parseLoanOfferingRatesFromAddValueTx(
        MarginCommon.Position storage position,
        uint256[8] values256
    )
        internal
        view
        returns (MarginCommon.LoanRates memory)
    {
        MarginCommon.LoanRates memory rates = MarginCommon.LoanRates({
            maxAmount: values256[0],
            minAmount: values256[1],
            minQuoteToken: values256[2],
            interestRate: position.interestRate,
            lenderFee: values256[3],
            takerFee: values256[4],
            interestPeriod: position.interestPeriod
        });

        return rates;
    }

    function parseLoanOfferingSignature(
        uint8 sigV,
        bytes32[2] sigRS
    )
        internal
        pure
        returns (MarginCommon.Signature memory)
    {
        MarginCommon.Signature memory signature = MarginCommon.Signature({
            v: sigV,
            r: sigRS[0],
            s: sigRS[1]
        });

        return signature;
    }
}
