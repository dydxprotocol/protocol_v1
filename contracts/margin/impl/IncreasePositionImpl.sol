pragma solidity 0.4.23;
pragma experimental "v0.5.0";

import { AddressUtils } from "zeppelin-solidity/contracts/AddressUtils.sol";
import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { MarginCommon } from "./MarginCommon.sol";
import { MarginState } from "./MarginState.sol";
import { OpenPositionShared } from "./OpenPositionShared.sol";
import { Vault } from "../Vault.sol";
import { MathHelpers } from "../../lib/MathHelpers.sol";
import { ExchangeWrapper } from "../interfaces/ExchangeWrapper.sol";
import { LoanOwner } from "../interfaces/LoanOwner.sol";
import { PositionOwner } from "../interfaces/PositionOwner.sol";


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
     * A position was increased
     */
    event PositionIncreased(
        bytes32 indexed positionId,
        address indexed trader,
        address indexed lender,
        address positionOwner,
        address loanOwner,
        bytes32 loanHash,
        address loanFeeRecipient,
        uint256 amountBorrowed,
        uint256 principalAdded,
        uint256 heldTokenFromSell,
        uint256 depositAmount,
        bool    depositInHeldToken
    );

    // ============ Public Implementation Functions ============

    function increasePositionImpl(
        MarginState.State storage state,
        bytes32 positionId,
        address[7] addresses,
        uint256[8] values256,
        uint32[2] values32,
        uint8 sigV,
        bytes32[2] sigRS,
        bool depositInHeldToken,
        bytes orderData
    )
        public
        returns (uint256)
    {
        MarginCommon.Position storage position =
            MarginCommon.getPositionFromStorage(state, positionId);

        OpenPositionShared.OpenTx memory transaction = parseIncreasePositionTx(
            position,
            addresses,
            values256,
            values32,
            sigV,
            sigRS,
            depositInHeldToken
        );

        uint256 heldTokenFromSell = preStateUpdate(
            state,
            transaction,
            position,
            positionId,
            orderData
        );

        updateState(
            position,
            positionId,
            transaction.principal,
            transaction.loanOffering.payer
        );

        // LOG EVENT
        recordPositionIncreased(
            transaction,
            positionId,
            position,
            heldTokenFromSell
        );

        return transaction.lenderAmount;
    }

    function increasePositionDirectlyImpl(
        MarginState.State storage state,
        bytes32 positionId,
        uint256 principalToAdd
    )
        public
        returns (uint256)
    {
        MarginCommon.Position storage position =
            MarginCommon.getPositionFromStorage(state, positionId);

        uint256 heldTokenAmount = getPositionMinimumHeldToken(
            positionId,
            state,
            principalToAdd,
            position
        );

        Vault(state.VAULT).transferToVault(
            positionId,
            position.heldToken,
            msg.sender,
            heldTokenAmount
        );

        updateState(
            position,
            positionId,
            principalToAdd,
            msg.sender
        );

        emit PositionIncreased(
            positionId,
            msg.sender,
            msg.sender,
            position.owner,
            position.lender,
            "",
            address(0),
            0,
            principalToAdd,
            0,
            heldTokenAmount,
            true
        );

        return heldTokenAmount;
    }

    // ============ Helper Functions ============

    function preStateUpdate(
        MarginState.State storage state,
        OpenPositionShared.OpenTx transaction,
        MarginCommon.Position storage position,
        bytes32 positionId,
        bytes orderData
    )
        internal
        returns (uint256 /* heldTokenFromSell */)
    {
        validate(transaction, position);
        uint256 positionMinimumHeldToken = setDepositAmount(
            state,
            transaction,
            position,
            positionId,
            orderData
        );

        uint256 heldTokenFromSell;
        uint256 totalHeldTokenReceived;

        (
            heldTokenFromSell,
            totalHeldTokenReceived
        ) = OpenPositionShared.openPositionInternalPreStateUpdate(
            state,
            transaction,
            positionId,
            orderData
        );

        // This should always be true unless there is a faulty ExchangeWrapper (i.e. the
        // ExchangeWrapper traded at a different price from what it said it would)
        assert(positionMinimumHeldToken == totalHeldTokenReceived);

        return heldTokenFromSell;
    }

    function validate(
        OpenPositionShared.OpenTx transaction,
        MarginCommon.Position storage position
    )
        internal
        view
    {
        require(position.callTimeLimit <= transaction.loanOffering.callTimeLimit);

        // require the position to end no later than the loanOffering's maximum acceptable end time
        uint256 positionEndTimestamp = uint256(position.startTimestamp).add(position.maxDuration);
        uint256 offeringEndTimestamp = block.timestamp.add(transaction.loanOffering.maxDuration);
        require(positionEndTimestamp <= offeringEndTimestamp);

        // Do not allow value to be added after the max duration
        require(block.timestamp < positionEndTimestamp);
    }

    function setDepositAmount(
        MarginState.State storage state,
        OpenPositionShared.OpenTx transaction,
        MarginCommon.Position storage position,
        bytes32 positionId,
        bytes orderData
    )
        internal
        view // Does modify transaction
        returns (uint256 /* positionMinimumHeldToken */)
    {
        // Amount of heldToken we need to add to the position to maintain the position's ratio
        // of heldToken to owedToken
        uint256 positionMinimumHeldToken = getPositionMinimumHeldToken(
            positionId,
            state,
            transaction.principal,
            position
        );

        if (transaction.depositInHeldToken) {
            uint256 heldTokenFromSell = ExchangeWrapper(transaction.exchangeWrapper)
                .getTradeMakerTokenAmount(
                    transaction.loanOffering.heldToken,
                    transaction.loanOffering.owedToken,
                    transaction.lenderAmount,
                    orderData
                );

            require(heldTokenFromSell <= positionMinimumHeldToken);
            transaction.depositAmount = positionMinimumHeldToken.sub(heldTokenFromSell);
        } else {
            uint256 owedTokenToSell = ExchangeWrapper(transaction.exchangeWrapper)
                .getTakerTokenPrice(
                    transaction.loanOffering.heldToken,
                    transaction.loanOffering.owedToken,
                    positionMinimumHeldToken,
                    orderData
                );

            require(transaction.lenderAmount <= owedTokenToSell);
            transaction.depositAmount = owedTokenToSell.sub(transaction.lenderAmount);
            transaction.desiredTokenFromSell = positionMinimumHeldToken;
        }

        return positionMinimumHeldToken;
    }

    function getPositionMinimumHeldToken(
        bytes32 positionId,
        MarginState.State storage state,
        uint256 principalAdded,
        MarginCommon.Position storage position
    )
        internal
        view
        returns (uint256)
    {
        uint256 heldTokenBalance = Vault(state.VAULT).balances(
            positionId, position.heldToken);

        return MathHelpers.getPartialAmountRoundedUp(
            principalAdded,
            position.principal,
            heldTokenBalance
        );
    }

    function updateState(
        MarginCommon.Position storage position,
        bytes32 positionId,
        uint256 principalAdded,
        address loanPayer
    )
        internal
    {
        position.principal = position.principal.add(principalAdded);

        address owner = position.owner;
        address lender = position.lender;

        // Unless msg.sender is the position owner and is not a smart contract, call out
        // to the owner to ensure they consent to value being added
        if (msg.sender != owner || AddressUtils.isContract(owner)) {
            require(
                PositionOwner(owner).marginPositionIncreased(
                    msg.sender,
                    positionId,
                    principalAdded
                )
            );
        }

        // Unless the loan offering's payer is the owner of the loan position and is not a smart
        // contract, call out to the owner of the loan position to ensure they consent
        // to value being added
        if (loanPayer != lender || AddressUtils.isContract(lender)) {
            require(
                LoanOwner(lender).marginLoanIncreased(
                    loanPayer,
                    positionId,
                    principalAdded
                )
            );
        }
    }

    function recordPositionIncreased(
        OpenPositionShared.OpenTx transaction,
        bytes32 positionId,
        MarginCommon.Position storage position,
        uint256 heldTokenFromSell
    )
        internal
    {
        emit PositionIncreased(
            positionId,
            msg.sender,
            transaction.loanOffering.payer,
            position.owner,
            position.lender,
            transaction.loanOffering.loanHash,
            transaction.loanOffering.feeRecipient,
            transaction.lenderAmount,
            transaction.principal,
            heldTokenFromSell,
            transaction.depositAmount,
            transaction.depositInHeldToken
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
        bool depositInHeldToken
    )
        internal
        view
        returns (OpenPositionShared.OpenTx memory)
    {
        OpenPositionShared.OpenTx memory transaction = OpenPositionShared.OpenTx({
            owner: position.owner,
            principal: values256[7],
            lenderAmount: MarginCommon.calculateLenderAmountForIncreasePosition(
                position,
                values256[7],
                block.timestamp
            ),
            depositAmount: 0,
            loanOffering: parseLoanOfferingFromIncreasePositionTx(
                position,
                addresses,
                values256,
                values32,
                sigV,
                sigRS
            ),
            exchangeWrapper: addresses[6],
            depositInHeldToken: depositInHeldToken,
            desiredTokenFromSell: 0
        });

        return transaction;
    }

    function parseLoanOfferingFromIncreasePositionTx(
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
            owedToken: position.owedToken,
            heldToken: position.heldToken,
            payer: addresses[0],
            signer: addresses[1],
            owner: position.lender,
            taker: addresses[2],
            feeRecipient: addresses[3],
            lenderFeeToken: addresses[4],
            takerFeeToken: addresses[5],
            rates: parseLoanOfferingRatesFromIncreasePositionTx(position, values256),
            expirationTimestamp: values256[5],
            callTimeLimit: values32[0],
            maxDuration: values32[1],
            salt: values256[6],
            loanHash: 0,
            signature: parseLoanOfferingSignature(sigV, sigRS)
        });

        loanOffering.loanHash = MarginCommon.getLoanOfferingHash(loanOffering);

        return loanOffering;
    }

    function parseLoanOfferingRatesFromIncreasePositionTx(
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
            minHeldToken: values256[2],
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
