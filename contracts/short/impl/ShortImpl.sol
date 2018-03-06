pragma solidity 0.4.19;

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { ShortSellCommon } from "./ShortSellCommon.sol";
import { Vault } from "../Vault.sol";
import { Trader } from "../Trader.sol";
import { Proxy } from "../../shared/Proxy.sol";
import { MathHelpers } from "../../lib/MathHelpers.sol";
import { ShortSellState } from "./ShortSellState.sol";
import { LoanOfferingVerifier } from "../interfaces/LoanOfferingVerifier.sol";


/**
 * @title ShortImpl
 * @author dYdX
 *
 * This library contains the implementation for the short function of ShortSell
 */
library ShortImpl {
    using SafeMath for uint256;

    // ------------------------
    // -------- Events --------
    // ------------------------

    /**
     * A short sell occurred
     */
    event ShortInitiated(
        bytes32 indexed id,
        address indexed shortSeller,
        address indexed lender,
        bytes32 loanHash,
        address underlyingToken,
        address baseToken,
        address loanFeeRecipient,
        uint256 shortAmount,
        uint256 baseTokenFromSell,
        uint256 depositAmount,
        uint32 callTimeLimit,
        uint32 maxDuration
    );

    // -----------------------
    // ------- Structs -------
    // -----------------------

    struct ShortTx {
        address underlyingToken;
        address baseToken;
        uint256 shortAmount;
        uint256 depositAmount;
        ShortSellCommon.LoanOffering loanOffering;
        BuyOrder buyOrder;
    }

    struct BuyOrder {
        address maker;
        address taker;
        address feeRecipient;
        address makerFeeToken;
        address takerFeeToken;
        uint256 baseTokenAmount;
        uint256 underlyingTokenAmount;
        uint256 makerFee;
        uint256 takerFee;
        uint256 expirationTimestamp;
        uint256 salt;
        ShortSellCommon.Signature signature;
    }

    // -------------------------------------------
    // ----- Public Implementation Functions -----
    // -------------------------------------------

    function shortImpl(
        ShortSellState.State storage state,
        address[13] addresses,
        uint256[17] values256,
        uint32[2] values32,
        uint8[2] sigV,
        bytes32[4] sigRS
    )
        public
        returns(bytes32 _shortId)
    {
        ShortTx memory transaction = parseShortTx(
            addresses,
            values256,
            values32,
            sigV,
            sigRS
        );

        bytes32 shortId = getNextShortId(state, transaction.loanOffering.loanHash);

        // Validate
        validateShort(
            state,
            transaction,
            shortId
        );

        // If maxDuration is 0, then assume it to be "infinite" (maxInt)
        uint32 parsedMaxDuration = (transaction.loanOffering.maxDuration == 0)
            ? MathHelpers.maxUint32() : transaction.loanOffering.maxDuration;
        uint256 partialInterestFee = getPartialInterestFee(transaction);

        // Prevent overflows when calculating interest fees. Unused result, throws on overflow
        // Should be the same calculation used in calculateInterestFee
        transaction.shortAmount.mul(parsedMaxDuration).mul(partialInterestFee);

        // STATE UPDATES

        // Update global amounts for the loan and lender
        state.loanFills[transaction.loanOffering.loanHash] =
            state.loanFills[transaction.loanOffering.loanHash].add(transaction.shortAmount);
        state.loanNumbers[transaction.loanOffering.loanHash] =
            state.loanNumbers[transaction.loanOffering.loanHash].add(1);

        // Check no casting errors
        require(
            uint256(uint32(block.timestamp)) == block.timestamp
        );

        addShort(
            state,
            shortId,
            transaction.underlyingToken,
            transaction.baseToken,
            transaction.shortAmount,
            partialInterestFee,
            transaction.loanOffering.callTimeLimit,
            uint32(block.timestamp),
            parsedMaxDuration,
            transaction.loanOffering.lender,
            msg.sender
        );

        // EXTERNAL CALLS

        // If the lender is a smart contract, call out to it to get its consent for this loan
        // This is done after other validations/state updates as it is an external call
        // NOTE: The short will exist in the Repo for this call
        //       (possible other contract calls back into ShortSell)
        getConsentIfSmartContractLender(transaction, shortId);

        // Transfer tokens
        transferTokensForShort(
            state,
            shortId,
            transaction
        );

        // Do the sell
        uint256 baseTokenReceived = executeSell(
            state,
            transaction,
            shortId
        );

        // LOG EVENT
        // one level of indirection in order to number of variables for solidity compiler
        recordShortInitiated(
            shortId,
            msg.sender,
            transaction,
            baseTokenReceived
        );

        return shortId;
    }

    // --------- Helper Functions ---------

    function getNextShortId(
        ShortSellState.State storage state,
        bytes32 loanHash
    )
        internal
        view
        returns (bytes32 _shortId)
    {
        return keccak256(
            loanHash,
            state.loanNumbers[loanHash]
        );
    }

    function validateShort(
        ShortSellState.State storage state,
        ShortTx transaction,
        bytes32 shortId
    )
        internal
        view
    {
        // Disallow 0 value shorts
        require(transaction.shortAmount > 0);

        // Make sure we don't already have this short id
        require(!ShortSellCommon.containsShortImpl(state, shortId));

        // If the taker is 0x000... then anyone can take it. Otherwise only the taker can use it
        if (transaction.loanOffering.taker != address(0)) {
            require(msg.sender == transaction.loanOffering.taker);
        }

        // Require the order to either be pre-approved on-chain or to have a valid signature
        require(
            state.isLoanApproved[transaction.loanOffering.loanHash]
            || isValidSignature(transaction.loanOffering)
        );

        // Validate the short amount is <= than max and >= min
        require(
            transaction.shortAmount.add(
                ShortSellCommon.getUnavailableLoanOfferingAmountImpl(
                    state,
                    transaction.loanOffering.loanHash
                )
            ) <= transaction.loanOffering.rates.maxAmount
        );
        require(transaction.shortAmount >= transaction.loanOffering.rates.minAmount);

        uint256 minimumDeposit = MathHelpers.getPartialAmount(
            transaction.shortAmount,
            transaction.loanOffering.rates.maxAmount,
            transaction.loanOffering.rates.minimumDeposit
        );

        require(transaction.depositAmount >= minimumDeposit);
        require(transaction.loanOffering.expirationTimestamp > block.timestamp);

        /*  Validate the minimum sell price
         *
         *    loan min sell            buy order base token amount
         *  -----------------  <=  -----------------------------------
         *   loan max amount        buy order underlying token amount
         *
         *                      |
         *                      V
         *
         *  loan min sell * buy order underlying token amount
         *  <= buy order base token amount * loan max amount
         */

        require(
            transaction.loanOffering.rates.minimumSellAmount.mul(
                transaction.buyOrder.underlyingTokenAmount
            ) <= transaction.loanOffering.rates.maxAmount.mul(
                transaction.buyOrder.baseTokenAmount
            )
        );
    }

    function isValidSignature(
        ShortSellCommon.LoanOffering loanOffering
    )
        internal
        pure
        returns (bool _isValid)
    {
        address recoveredSigner = ecrecover(
            keccak256("\x19Ethereum Signed Message:\n32", loanOffering.loanHash),
            loanOffering.signature.v,
            loanOffering.signature.r,
            loanOffering.signature.s
        );

        // If the signer field is 0, then the lender should have signed it
        if (loanOffering.signer == address(0)) {
            return loanOffering.lender == recoveredSigner;
        } else {
            // Otherwise the signer should have signed it
            return loanOffering.signer == recoveredSigner;
        }
    }

    function getConsentIfSmartContractLender(
        ShortTx transaction,
        bytes32 shortId
    )
        internal
    {
        if (transaction.loanOffering.signer != address(0)) {
            require(
                LoanOfferingVerifier(transaction.loanOffering.lender).verifyLoanOffering(
                    getLoanOfferingAddresses(transaction),
                    getLoanOfferingValues256(transaction),
                    getLoanOfferingValues32(transaction),
                    shortId
                )
            );
        }
    }

    function transferTokensForShort(
        ShortSellState.State storage state,
        bytes32 shortId,
        ShortTx transaction
    )
        internal
    {
        transferTokensFromShortSeller(
            state,
            shortId,
            transaction
        );

        // Transfer underlying token
        Vault(state.VAULT).transferToVault(
            shortId,
            transaction.underlyingToken,
            transaction.loanOffering.lender,
            transaction.shortAmount
        );

        // Transfer loan fees
        transferLoanFees(
            state,
            transaction
        );
    }

    function transferTokensFromShortSeller(
        ShortSellState.State storage state,
        bytes32 shortId,
        ShortTx transaction
    )
        internal
    {
        // Calculate Fee
        uint256 buyOrderTakerFee = MathHelpers.getPartialAmount(
            transaction.shortAmount,
            transaction.buyOrder.underlyingTokenAmount,
            transaction.buyOrder.takerFee
        );

        // Transfer deposit and buy taker fee
        if (transaction.buyOrder.feeRecipient == address(0)) {
            Vault(state.VAULT).transferToVault(
                shortId,
                transaction.baseToken,
                msg.sender,
                transaction.depositAmount
            );
        } else if (transaction.baseToken == transaction.buyOrder.takerFeeToken) {
            // If the buy order taker fee token is base token
            // we can just transfer base token once from the short seller

            Vault(state.VAULT).transferToVault(
                shortId,
                transaction.baseToken,
                msg.sender,
                transaction.depositAmount.add(buyOrderTakerFee)
            );
        } else {
            // Otherwise transfer the deposit and buy order taker fee separately
            Vault(state.VAULT).transferToVault(
                shortId,
                transaction.baseToken,
                msg.sender,
                transaction.depositAmount
            );

            Vault(state.VAULT).transferToVault(
                shortId,
                transaction.buyOrder.takerFeeToken,
                msg.sender,
                buyOrderTakerFee
            );
        }
    }

    function transferLoanFees(
        ShortSellState.State storage state,
        ShortTx transaction
    )
        internal
    {
        Proxy proxy = Proxy(state.PROXY);
        uint256 lenderFee = MathHelpers.getPartialAmount(
            transaction.shortAmount,
            transaction.loanOffering.rates.maxAmount,
            transaction.loanOffering.rates.lenderFee
        );
        proxy.transferTo(
            transaction.loanOffering.lenderFeeToken,
            transaction.loanOffering.lender,
            transaction.loanOffering.feeRecipient,
            lenderFee
        );
        uint256 takerFee = MathHelpers.getPartialAmount(
            transaction.shortAmount,
            transaction.loanOffering.rates.maxAmount,
            transaction.loanOffering.rates.takerFee
        );
        proxy.transferTo(
            transaction.loanOffering.takerFeeToken,
            msg.sender,
            transaction.loanOffering.feeRecipient,
            takerFee
        );
    }

    function executeSell(
        ShortSellState.State storage state,
        ShortTx transaction,
        bytes32 shortId
    )
        internal
        returns (uint256 _baseTokenReceived)
    {
        var ( , baseTokenReceived) = Trader(state.TRADER).trade(
            shortId,
            [
                transaction.buyOrder.maker,
                transaction.buyOrder.taker,
                transaction.baseToken,
                transaction.underlyingToken,
                transaction.buyOrder.feeRecipient,
                transaction.buyOrder.makerFeeToken,
                transaction.buyOrder.takerFeeToken
            ],
            [
                transaction.buyOrder.baseTokenAmount,
                transaction.buyOrder.underlyingTokenAmount,
                transaction.buyOrder.makerFee,
                transaction.buyOrder.takerFee,
                transaction.buyOrder.expirationTimestamp,
                transaction.buyOrder.salt
            ],
            transaction.shortAmount,
            transaction.buyOrder.signature.v,
            transaction.buyOrder.signature.r,
            transaction.buyOrder.signature.s,
            true
        );

        Vault vault = Vault(state.VAULT);

        // Should hold base token == deposit amount + base token from sell
        assert(
            vault.balances(
                shortId,
                transaction.baseToken
            ) == baseTokenReceived.add(transaction.depositAmount)
        );

        // Should hold 0 underlying token
        assert(vault.balances(shortId, transaction.underlyingToken) == 0);

        return baseTokenReceived;
    }

    function recordShortInitiated(
        bytes32 shortId,
        address shortSeller,
        ShortTx transaction,
        uint256 baseTokenReceived
    )
        internal
    {
        ShortInitiated(
            shortId,
            shortSeller,
            transaction.loanOffering.lender,
            transaction.loanOffering.loanHash,
            transaction.underlyingToken,
            transaction.baseToken,
            transaction.loanOffering.feeRecipient,
            transaction.shortAmount,
            baseTokenReceived,
            transaction.depositAmount,
            transaction.loanOffering.callTimeLimit,
            transaction.loanOffering.maxDuration
        );
    }

    function getPartialInterestFee(
        ShortTx transaction
    )
        internal
        pure
        returns (uint256 _interestFee)
    {
        // Round up to disincentivize taking out smaller shorts in order to make reduced interest
        // payments. This would be an infeasiable attack in most scenarios due to low rounding error
        // and high transaction/gas fees, but is nonetheless theoretically possible.
        return MathHelpers.getPartialAmountRoundedUp(
            transaction.shortAmount,
            transaction.loanOffering.rates.maxAmount,
            transaction.loanOffering.rates.dailyInterestFee);
    }

    function addShort(
        ShortSellState.State storage state,
        bytes32 id,
        address underlyingToken,
        address baseToken,
        uint256 shortAmount,
        uint256 interestRate,
        uint32 callTimeLimit,
        uint32 startTimestamp,
        uint32 maxDuration,
        address lender,
        address seller
    )
        internal
    {
        require(!ShortSellCommon.containsShortImpl(state, id));
        require(startTimestamp != 0);

        state.shorts[id] = ShortSellCommon.Short({
            underlyingToken: underlyingToken,
            baseToken: baseToken,
            shortAmount: shortAmount,
            closedAmount: 0,
            interestRate: interestRate,
            requiredDeposit: 0,
            callTimeLimit: callTimeLimit,
            startTimestamp: startTimestamp,
            callTimestamp: 0,
            maxDuration: maxDuration,
            lender: lender,
            seller: seller
        });
    }

    // -------- Parsing Functions -------

    function parseShortTx(
        address[13] addresses,
        uint256[17] values,
        uint32[2] values32,
        uint8[2] sigV,
        bytes32[4] sigRS
    )
        internal
        view
        returns (ShortTx _transaction)
    {
        ShortTx memory transaction = ShortTx({
            underlyingToken: addresses[0],
            baseToken: addresses[1],
            shortAmount: values[15],
            depositAmount: values[16],
            loanOffering: parseLoanOffering(
                addresses,
                values,
                values32,
                sigV,
                sigRS
            ),
            buyOrder: parseBuyOrder(
                addresses,
                values,
                sigV,
                sigRS
            )
        });

        return transaction;
    }

    function parseLoanOffering(
        address[13] addresses,
        uint256[17] values,
        uint32[2] values32,
        uint8[2] sigV,
        bytes32[4] sigRS
    )
        internal
        view
        returns (ShortSellCommon.LoanOffering _loanOffering)
    {
        ShortSellCommon.LoanOffering memory loanOffering = ShortSellCommon.LoanOffering({
            lender: addresses[2],
            signer: addresses[3],
            taker: addresses[4],
            feeRecipient: addresses[5],
            lenderFeeToken: addresses[6],
            takerFeeToken: addresses[7],
            rates: parseLoanOfferRates(values),
            expirationTimestamp: values[7],
            callTimeLimit: values32[0],
            maxDuration: values32[1],
            salt: values[8],
            loanHash: 0,
            signature: parseLoanOfferingSignature(sigV, sigRS)
        });

        loanOffering.loanHash = ShortSellCommon.getLoanOfferingHash(
            loanOffering,
            addresses[1],
            addresses[0]
        );

        return loanOffering;
    }

    function parseLoanOfferRates(
        uint256[17] values
    )
        internal
        pure
        returns (ShortSellCommon.LoanRates _loanRates)
    {
        ShortSellCommon.LoanRates memory rates = ShortSellCommon.LoanRates({
            minimumDeposit: values[0],
            maxAmount: values[1],
            minAmount: values[2],
            minimumSellAmount: values[3],
            dailyInterestFee: values[4],
            lenderFee: values[5],
            takerFee: values[6]
        });

        return rates;
    }

    function parseLoanOfferingSignature(
        uint8[2] sigV,
        bytes32[4] sigRS
    )
        internal
        pure
        returns (ShortSellCommon.Signature _signature)
    {
        ShortSellCommon.Signature memory signature = ShortSellCommon.Signature({
            v: sigV[0],
            r: sigRS[0],
            s: sigRS[1]
        });

        return signature;
    }

    function parseBuyOrder(
        address[13] addresses,
        uint256[17] values,
        uint8[2] sigV,
        bytes32[4] sigRS
    )
        internal
        pure
        returns (BuyOrder _buyOrder)
    {
        BuyOrder memory order = BuyOrder({
            maker: addresses[8],
            taker: addresses[9],
            feeRecipient: addresses[10],
            makerFeeToken: addresses[11],
            takerFeeToken: addresses[12],
            baseTokenAmount: values[9],
            underlyingTokenAmount: values[10],
            makerFee: values[11],
            takerFee: values[12],
            expirationTimestamp: values[13],
            salt: values[14],
            signature: parseBuyOrderSignature(sigV, sigRS)
        });

        return order;
    }

    function parseBuyOrderSignature(
        uint8[2] sigV,
        bytes32[4] sigRS
    )
        internal
        pure
        returns (ShortSellCommon.Signature _signature)
    {
        ShortSellCommon.Signature memory signature = ShortSellCommon.Signature({
            v: sigV[1],
            r: sigRS[2],
            s: sigRS[3]
        });

        return signature;
    }

    function getLoanOfferingAddresses(
        ShortTx transaction
    )
        internal
        pure
        returns (address[8] _addresses)
    {
        return [
            transaction.underlyingToken,
            transaction.baseToken,
            transaction.loanOffering.lender,
            transaction.loanOffering.signer,
            transaction.loanOffering.taker,
            transaction.loanOffering.feeRecipient,
            transaction.loanOffering.lenderFeeToken,
            transaction.loanOffering.takerFeeToken
        ];
    }

    function getLoanOfferingValues256(
        ShortTx transaction
    )
        internal
        pure
        returns (uint256[9] _values)
    {
        return [
            transaction.loanOffering.rates.minimumDeposit,
            transaction.loanOffering.rates.maxAmount,
            transaction.loanOffering.rates.minAmount,
            transaction.loanOffering.rates.minimumSellAmount,
            transaction.loanOffering.rates.dailyInterestFee,
            transaction.loanOffering.rates.lenderFee,
            transaction.loanOffering.rates.takerFee,
            transaction.loanOffering.expirationTimestamp,
            transaction.loanOffering.salt
        ];
    }

    function getLoanOfferingValues32(
        ShortTx transaction
    )
        internal
        pure
        returns (uint32[2] _values)
    {
        return [
            transaction.loanOffering.callTimeLimit,
            transaction.loanOffering.maxDuration
        ];
    }
}
