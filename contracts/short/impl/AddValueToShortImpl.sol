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
import { InterestImpl } from "./InterestImpl.sol";
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
        uint256 baseTokenFromSell,
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
        returns (uint256 _effectiveAmountAdded)
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

        // Base token balance before transfering anything for this addition
        // NOTE: this must be done before executing the sell in shortInternalPreStateUpdate
        uint256 positionMinimumBaseToken = getPositionMinimumBaseToken(
            shortId,
            state,
            transaction,
            short
        );

        uint256 baseTokenReceived = ShortShared.shortInternalPreStateUpdate(
            state,
            transaction,
            shortId,
            orderData
        );

        validateAndSetDepositAmount(
            transaction,
            short,
            positionMinimumBaseToken,
            baseTokenReceived
        );

        ShortShared.validateMinimumBaseToken(
            transaction,
            baseTokenReceived
        );

        uint256 effectiveAmountAdded = updateState(
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
            baseTokenReceived,
            effectiveAmountAdded
        );

        return effectiveAmountAdded;
    }

    // --------- Helper Functions ---------

    function getPositionMinimumBaseToken(
        bytes32 shortId,
        ShortSellState.State storage state,
        ShortShared.ShortTx transaction,
        ShortSellCommon.Short storage short
    )
        internal
        view
        returns (uint256)
    {
        uint256 baseTokenBalance = Vault(state.VAULT).balances(shortId, transaction.baseToken);

        return MathHelpers.getPartialAmountRoundedUp(
            transaction.shortAmount,
            short.shortAmount,
            baseTokenBalance
        );
    }

    function validateAndSetDepositAmount(
        ShortShared.ShortTx transaction,
        ShortSellCommon.Short storage short,
        uint256 positionMinimumBaseToken,
        uint256 baseTokenReceived
    )
        internal
        view
    {
        require(baseTokenReceived <= positionMinimumBaseToken);
        require(short.maxDuration <= transaction.loanOffering.maxDuration);
        require(short.callTimeLimit >= transaction.loanOffering.callTimeLimit);

        transaction.depositAmount = positionMinimumBaseToken.sub(baseTokenReceived);
    }

    function updateState(
        ShortShared.ShortTx transaction,
        bytes32 shortId,
        ShortSellCommon.Short storage short
    )
        internal
        returns (uint256 _effectiveAmountAdded)
    {
        uint256 timeElapsed = ShortSellCommon.calculatePositionTimeElapsed(short, block.timestamp);
        uint256 effectiveAmount = InterestImpl.getInverseCompoundedInterest(
            transaction.shortAmount,
            short.interestRate,
            timeElapsed,
            short.interestPeriod
        );

        short.shortAmount = short.shortAmount.add(effectiveAmount);

        address seller = short.seller;
        address lender = short.lender;

        if (msg.sender != seller || ContractHelper.isContract(seller)) {
            require(
                ShortOwner(seller).additionalShortValueAdded(
                    msg.sender,
                    shortId,
                    effectiveAmount
                )
            );
        }

        if (transaction.loanOffering.lender != lender || ContractHelper.isContract(lender)) {
            require(
                LoanOwner(lender).additionalLoanValueAdded(
                    transaction.loanOffering.lender,
                    shortId,
                    effectiveAmount
                )
            );
        }

        return effectiveAmount;
    }

    function recordValueAddedToShort(
        ShortShared.ShortTx transaction,
        bytes32 shortId,
        ShortSellCommon.Short storage short,
        uint256 baseTokenFromSell,
        uint256 effectiveAmountAdded
    )
        internal
    {
        emit ValueAddedToShort(
            shortId,
            short.seller,
            short.lender,
            transaction.loanOffering.loanHash,
            transaction.loanOffering.feeRecipient,
            transaction.shortAmount,
            effectiveAmountAdded,
            baseTokenFromSell,
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
            underlyingToken: short.underlyingToken,
            baseToken: short.baseToken,
            shortAmount: values256[7],
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
            lender: addresses[0],
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
            short.baseToken,
            short.underlyingToken
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
            minBaseToken: values256[2],
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
