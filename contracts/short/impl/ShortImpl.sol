pragma solidity 0.4.18;

import "zeppelin-solidity/contracts/ReentrancyGuard.sol";
import "./ShortSellState.sol";
import "./ShortSellEvents.sol";
import "./ShortCommonHelperFunctions.sol";
import "../ShortSellRepo.sol";
import "../Vault.sol";
import "../Trader.sol";
import "../ShortSellAuctionRepo.sol";
import "../../lib/SafeMath.sol";

/**
 * @title ShortImpl
 * @author Antonio Juliano
 *
 * This contract contains the implementation for the short function of ShortSell
 */
 /* solium-disable-next-line */
contract ShortImpl is
    SafeMath,
    ShortSellState,
    ShortSellEvents,
    ReentrancyGuard,
    ShortCommonHelperFunctions {

    // -----------------------
    // ------- Structs -------
    // -----------------------

    struct ShortTx {
        address underlyingToken;
        address baseToken;
        uint shortAmount;
        uint depositAmount;
        LoanOffering loanOffering;
        BuyOrder buyOrder;
    }

    struct BuyOrder {
        address maker;
        address taker;
        address feeRecipient;
        address makerFeeToken;
        address takerFeeToken;
        uint baseTokenAmount;
        uint underlyingTokenAmount;
        uint makerFee;
        uint takerFee;
        uint expirationTimestamp;
        uint salt;
        Signature signature;
    }

    // -------------------------------------------
    // ---- Internal Implementation Functions ----
    // -------------------------------------------

    function shortImpl(
        address[12] addresses,
        uint[17] values256,
        uint32[2] values32,
        uint8[2] sigV,
        bytes32[4] sigRS
    )
        internal
        nonReentrant
        returns(bytes32 _shortId)
    {
        ShortTx memory transaction = parseShortTx(
            addresses,
            values256,
            values32,
            sigV,
            sigRS
        );

        bytes32 shortId = getNextShortId(transaction.loanOffering.loanHash);

        // Validate
        validateShort(
            transaction,
            shortId
        );

        // STATE UPDATES

        // Update global amounts for the loan and lender
        loanFills[transaction.loanOffering.loanHash] = add(
            loanFills[transaction.loanOffering.loanHash],
            transaction.shortAmount
        );
        loanNumbers[transaction.loanOffering.loanHash] =
            add(loanNumbers[transaction.loanOffering.loanHash], 1);

        // Check no casting errors
        require(
            uint(uint32(block.timestamp)) == block.timestamp
        );

        ShortSellRepo(REPO).addShort(
            shortId,
            transaction.underlyingToken,
            transaction.baseToken,
            transaction.shortAmount,
            transaction.loanOffering.rates.interestRate,
            transaction.loanOffering.callTimeLimit,
            transaction.loanOffering.lockoutTime,
            uint32(block.timestamp),
            transaction.loanOffering.lender,
            msg.sender
        );

        // EXTERNAL CALLS

        // Transfer tokens
        transferTokensForShort(
            shortId,
            transaction
        );

        // Do the sell
        uint baseTokenReceived = executeSell(
            transaction,
            shortId
        );

        // LOG EVENT

        recordShortInitiated(
            shortId,
            msg.sender,
            transaction,
            baseTokenReceived
        );

        return shortId;
    }

    function getNextShortId(
        bytes32 loanHash
    )
        internal
        view
        returns (bytes32 _shortId)
    {
        return keccak256(
            loanHash,
            loanNumbers[loanHash]
        );
    }

    function validateShort(
        ShortTx transaction,
        bytes32 shortId
    )
        internal
        view
    {
        // Make sure we don't already have this short id
        require(!ShortSellRepo(REPO).containsShort(shortId));

        // If the taker is 0x000... then anyone can take it. Otherwise only the taker can use it
        if (transaction.loanOffering.taker != address(0)) {
            require(msg.sender == transaction.loanOffering.taker);
        }

        // Check Signature
        require(
            isValidSignature(transaction.loanOffering)
        );

        // Validate the short amount is <= than max and >= min
        require(
            add(
                transaction.shortAmount,
                getUnavailableLoanOfferingAmountImpl(transaction.loanOffering.loanHash)
            ) <= transaction.loanOffering.rates.maxAmount
        );
        require(transaction.shortAmount >= transaction.loanOffering.rates.minAmount);

        uint minimumDeposit = getPartialAmount(
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
            mul(
                transaction.loanOffering.rates.minimumSellAmount,
                transaction.buyOrder.underlyingTokenAmount
            ) <= mul(
                transaction.loanOffering.rates.maxAmount,
                transaction.buyOrder.baseTokenAmount
            )
        );
    }

    function isValidSignature(
        LoanOffering loanOffering
    )
        internal
        pure
        returns (bool _isValid)
    {
        return loanOffering.lender == ecrecover(
            keccak256("\x19Ethereum Signed Message:\n32", loanOffering.loanHash),
            loanOffering.signature.v,
            loanOffering.signature.r,
            loanOffering.signature.s
        );
    }

    function transferTokensForShort(
        bytes32 shortId,
        ShortTx transaction
    )
        internal
    {
        transferTokensFromShortSeller(
            shortId,
            transaction
        );

        // Transfer underlying token
        Vault(VAULT).transfer(
            shortId,
            transaction.underlyingToken,
            transaction.loanOffering.lender,
            transaction.shortAmount
        );

        // Transfer loan fees
        transferLoanFees(
            transaction
        );
    }

    function transferTokensFromShortSeller(
        bytes32 shortId,
        ShortTx transaction
    )
        internal
    {
        // Calculate Fee
        uint buyOrderTakerFee = getPartialAmount(
            transaction.shortAmount,
            transaction.buyOrder.underlyingTokenAmount,
            transaction.buyOrder.takerFee
        );

        // Transfer deposit and buy taker fee
        if (transaction.buyOrder.feeRecipient == address(0)) {
            Vault(VAULT).transfer(
                shortId,
                transaction.baseToken,
                msg.sender,
                transaction.depositAmount
            );
        } else if (transaction.baseToken == transaction.buyOrder.takerFeeToken) {
            // If the buy order taker fee token is base token
            // we can just transfer base token once from the short seller

            Vault(VAULT).transfer(
                shortId,
                transaction.baseToken,
                msg.sender,
                add(transaction.depositAmount, buyOrderTakerFee)
            );
        } else {
            // Otherwise transfer the deposit and buy order taker fee separately
            Vault(VAULT).transfer(
                shortId,
                transaction.baseToken,
                msg.sender,
                transaction.depositAmount
            );

            Vault(VAULT).transfer(
                shortId,
                transaction.buyOrder.takerFeeToken,
                msg.sender,
                buyOrderTakerFee
            );
        }
    }

    function transferLoanFees(
        ShortTx transaction
    )
        internal
    {
        Proxy proxy = Proxy(PROXY);
        uint lenderFee = getPartialAmount(
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
        uint takerFee = getPartialAmount(
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
        ShortTx transaction,
        bytes32 shortId
    )
        internal
        returns (uint _baseTokenReceived)
    {
        var ( , baseTokenReceived) = Trader(TRADER).trade(
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

        Vault vault = Vault(VAULT);

        // Should hold base token == deposit amount + base token from sell
        assert(
            vault.balances(
                shortId,
                transaction.baseToken
            ) == add(baseTokenReceived, transaction.depositAmount)
        );

        // Should hold 0 underlying token
        assert(vault.balances(shortId, transaction.underlyingToken) == 0);

        return baseTokenReceived;
    }

    function recordShortInitiated(
        bytes32 shortId,
        address shortSeller,
        ShortTx transaction,
        uint baseTokenReceived
    )
        internal
    {
        ShortInitiated(
            shortId,
            shortSeller,
            transaction.loanOffering.lender,
            transaction.underlyingToken,
            transaction.baseToken,
            transaction.loanOffering.feeRecipient,
            transaction.buyOrder.feeRecipient,
            transaction.shortAmount,
            baseTokenReceived,
            transaction.depositAmount,
            transaction.loanOffering.lockoutTime,
            transaction.loanOffering.callTimeLimit,
            transaction.loanOffering.rates.interestRate,
            block.timestamp
        );
    }

    // -------- Parsing Functions -------

    function parseShortTx(
        address[12] addresses,
        uint[17] values,
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
        address[12] addresses,
        uint[17] values,
        uint32[2] values32,
        uint8[2] sigV,
        bytes32[4] sigRS
    )
        internal
        view
        returns (LoanOffering _loanOffering)
    {
        LoanOffering memory loanOffering = LoanOffering({
            lender: addresses[2],
            taker: addresses[3],
            feeRecipient: addresses[4],
            lenderFeeToken: addresses[5],
            takerFeeToken: addresses[6],
            rates: parseLoanOfferRates(values),
            expirationTimestamp: values[7],
            lockoutTime: values32[0],
            callTimeLimit: values32[1],
            salt: values[8],
            loanHash: 0,
            signature: parseLoanOfferingSignature(sigV, sigRS)
        });

        loanOffering.loanHash = getLoanOfferingHash(
            loanOffering,
            addresses[1],
            addresses[0]
        );

        return loanOffering;
    }

    function parseLoanOfferRates(
        uint[17] values
    )
        internal
        pure
        returns (LoanRates _loanRates)
    {
        LoanRates memory rates = LoanRates({
            minimumDeposit: values[0],
            maxAmount: values[1],
            minAmount: values[2],
            minimumSellAmount: values[3],
            interestRate: values[4],
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
        returns (Signature _signature)
    {
        Signature memory signature = Signature({
            v: sigV[0],
            r: sigRS[0],
            s: sigRS[1]
        });

        return signature;
    }

    function parseBuyOrder(
        address[12] addresses,
        uint[17] values,
        uint8[2] sigV,
        bytes32[4] sigRS
    )
        internal
        pure
        returns (BuyOrder _buyOrder)
    {
        BuyOrder memory order = BuyOrder({
            maker: addresses[7],
            taker: addresses[8],
            feeRecipient: addresses[9],
            makerFeeToken: addresses[10],
            takerFeeToken: addresses[11],
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
        returns (Signature _signature)
    {
        Signature memory signature = Signature({
            v: sigV[1],
            r: sigRS[2],
            s: sigRS[3]
        });

        return signature;
    }
}
