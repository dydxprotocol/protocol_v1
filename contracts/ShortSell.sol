pragma solidity 0.4.15;

import './lib/Ownable.sol';
import './lib/SafeMath.sol';
import './Vault.sol';
import './Proxy.sol';
import './Trader.sol';
import './ShortSellRepo.sol';

/**
 * @title ShortSell
 * @author Antonio Juliano
 *
 * This contract is used to facilitate short selling as per the dYdX short sell protocol
 */
contract ShortSell is Ownable, SafeMath {
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

    struct LoanOffering {
        address lender;
        address taker;
        address feeRecipient;
        address lenderFeeToken;
        address takerFeeToken;
        LoanRates rates;
        uint expirationTimestamp;
        uint lockoutTime;
        uint callTimeLimit;
        uint salt;
        bytes32 loanHash;
        Signature signature;
    }

    struct LoanRates {
        uint minimumDeposit;
        uint maxAmount;
        uint minAmount;
        uint interestRate;
        uint lenderFee;
        uint takerFee;
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

    struct Signature {
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    struct LoanAmount {
        bool seen;
        uint remaining;
    }

    struct Short {
        address underlyingToken;
        address baseToken;
        uint shortAmount;
        uint interestRate;
        uint callTimeLimit;
        uint lockoutTime;
        uint startTimestamp;
        uint callTimestamp;
        address lender;
        address seller;
    }

    // ---------------------------
    // ----- State Variables -----
    // ---------------------------

    // Address of the Vault contract
    address public VAULT;

    // Address of the Trader contract
    address public TRADER;

    // Address of the ShortSellRepo contract
    address public REPO;

    // Address of the Proxy contract
    address public PROXY;

    mapping(bytes32 => LoanAmount) public loanAmounts;
    mapping(address => uint) public loanNumbers;

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
        address underlyingToken,
        address baseToken,
        address loanFeeRecipient,
        address buyOrderFeeRecipient,
        uint shortAmount,
        uint baseTokenFromSell,
        uint depositAmount,
        uint lockoutTime,
        uint callTimeLimit,
        uint interestRate,
        uint timestamp
    );

    /**
     * A short sell was closed
     */
    event ShortClosed(
        bytes32 indexed id,
        uint interestFee,
        uint shortSellerBaseToken,
        uint buybackCost,
        uint timestamp
    );

    /**
     * The loan for a short sell was called in
     */
    event LoanCalled(
        bytes32 indexed id,
        uint timestamp
    );

    /**
     * A loan call was canceled
     */
    event LoanCallCanceled(
        bytes32 indexed id,
        uint timestamp
    );

    /**
     * A short sell loan was forcibly recovered by the lender
     */
    event LoanForceRecovered(
        bytes32 indexed id,
        uint amount,
        uint timestamp
    );

    /**
     * Additional deposit for a short sell was posted by the short seller
     */
    event AdditionalDeposit(
        bytes32 indexed id,
        uint amount,
        uint timestamp
    );

    // -------------------------
    // ------ Constructor ------
    // -------------------------

    function ShortSell(
        address _vault,
        address _repo,
        address _trader,
        address _proxy
    ) Ownable() {
        VAULT = _vault;
        REPO = _repo;
        TRADER = _trader;
        PROXY = _proxy;
    }

    // -----------------------------
    // ------ Admin Functions ------
    // -----------------------------

    function updateTrader(
        address _trader
    ) onlyOwner {
        TRADER = _trader;
    }

    function updateProxy(
        address _proxy
    ) onlyOwner {
        PROXY = _proxy;
    }

    // Vault and Repo are immutable

    // -----------------------------------------
    // ---- Public State Changing Functions ----
    // -----------------------------------------

    event Test();


    /**
     * Initiate a short sell. Called by the short seller. Short seller must provide both a
     * signed loan offering as well as a signed 0x buy order for the underlying token to
     * be shorted
     *
     * 1 - base token deposit is transfered from the short seller to Vault
     * 2 - underlying token is transfered from lender to Vault
     * 3 - if there is a taker fee for the buy order, transfer it from short seller to Vault
     * 4 - use the provided 0x buy order to sell the loaned underlying token for base token.
     *     base token received from the sell is also stored in Vault
     * 5 - add details of the short sell to repo
     * 6 - Short event recorded
     *
     * @param  addresses  Addresses corresponding to:
     *
     *  [0] = underlying token
     *  [1] = base token
     *  [2] = lender
     *  [3] = loan taker
     *  [4] = loan fee recipient
     *  [5] = buy order maker
     *  [6] = buy order taker
     *  [7] = buy order fee recipient
     *  [8] = buy order maker fee token
     *  [9] = buy order taker fee token
     *  [10] = loan lender fee token
     *  [11] = loan taker fee token
     *
     * @param  values     Values corresponding to:
     *
     *  [0] = loan minimum deposit
     *  [1] = loan maximum amount
     *  [2] = loan minimum amount
     *  [3] = loan interest rate
     *  [4] = loan lender fee
     *  [5] = loan taker fee
     *  [6] = loan expiration timestamp
     *  [7] = loan lockout time
     *  [8] = loan call time limit
     *  [9] = loan salt
     *  [10] = buy order base token amount
     *  [11] = buy order underlying token amount
     *  [12] = buy order maker fee
     *  [13] = buy order taker fee
     *  [14] = buy order expiration timestamp (in seconds)
     *  [15] = buy order salt
     *  [16] = short amount
     *  [17] = deposit amount
     *
     * @param  sigV       ECDSA v parameters for [0] loan and [1] buy order
     * @param  sigRS      CDSA r and s parameters for [0] loan and [1] buy order
     * @return _shortId   unique identifier for the short sell
     */
    function short(
        address[12] addresses,
        uint[18] values,
        uint8[2] sigV,
        bytes32[4] sigRS
    ) external returns(bytes32 _shortId) {
        ShortTx memory transaction = parseShortTx(
            addresses,
            values,
            sigV,
            sigRS
        );

        bytes32 shortId = getNextShortId(transaction.loanOffering.lender);

        // Validate

        uint maxLoanAmount = validateShort(
            transaction,
            shortId
        );

        // Update global amounts for the loan and lender

        loanAmounts[transaction.loanOffering.loanHash].remaining =
            safeSub(maxLoanAmount, transaction.shortAmount);
        loanNumbers[transaction.loanOffering.lender] =
            safeAdd(loanNumbers[transaction.loanOffering.lender], 1);

        // Calculate Fees

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
                safeAdd(transaction.depositAmount, buyOrderTakerFee)
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

        // Transfer underlying token
        Vault(VAULT).transfer(
            shortId,
            transaction.underlyingToken,
            addresses[2],
            transaction.shortAmount
        );

        // Do the sell
        uint baseTokenReceived = executeSell(
            transaction,
            shortId
        );

        // Transfer loan fees
        transferLoanFees(
            transaction
        );

        // Should hold base token == deposit amount + base token from sell
        assert(
            Vault(VAULT).balances(
                shortId,
                transaction.baseToken
            ) == safeAdd(baseTokenReceived, transaction.depositAmount)
        );

        // Should hold 0 underlying token
        assert(Vault(VAULT).balances(shortId, transaction.underlyingToken) == 0);

        // Check no casting errors
        require(
            uint(uint32(transaction.loanOffering.callTimeLimit))
            == transaction.loanOffering.callTimeLimit
        );
        require(
            uint(uint32(transaction.loanOffering.lockoutTime))
            == transaction.loanOffering.lockoutTime
        );
        require(
            uint(uint32(block.timestamp))
            == block.timestamp
        );

        ShortSellRepo(REPO).addShort(
            shortId,
            transaction.underlyingToken,
            transaction.baseToken,
            transaction.shortAmount,
            transaction.loanOffering.rates.interestRate,
            uint32(transaction.loanOffering.callTimeLimit),
            uint32(transaction.loanOffering.lockoutTime),
            uint32(block.timestamp),
            transaction.loanOffering.lender,
            msg.sender
        );

        recordShortInitiated(
            shortId,
            msg.sender,
            transaction,
            baseTokenReceived
        );

        return shortId;
    }

    /**
     * Close a short sell. Only callable by short seller. Short seller must provide a 0x order
     * offering at least as much underlying token as was loaned for the short sell. There must be
     * enough base token left over after the trade to pay the lender the full owed interest fee.
     * The short seller is sent base token = deposit + profit - interest fee
     *
     * @param  shortId              unique id for the short sell
     * @param  orderAddresses       Addresses for the supplied 0x order:
     *                              [0] = maker
     *                              [1] = taker
     *                              [2] = fee recipient
     *                              [3] = maker fee token
     *                              [4] = taker fee token
     * @param  orderValues          Values for the supplied 0x order:
     *                              [0] = underlying token amount
     *                              [1] = base token amount
     *                              [2] = maker fee
     *                              [3] = taker fee
     *                              [4] = expiration timestamp
     *                              [5] = salt
     * @param  orderV               ECDSA signature parameter v for the 0x order
     * @param  orderR bytes32       CDSA signature parameter r for the 0x order
     * @param  orderS bytes32       CDSA signature parameter s for the 0x order
     * @return _baseTokenReceived   amount of base token received by the short seller after closing
     * @return _interestFeeAmount   interest fee in base token paid to the lender
     */
    function closeShort(
        bytes32 shortId,
        address[5] orderAddresses,
        uint[6] orderValues,
        uint8 orderV,
        bytes32 orderR,
        bytes32 orderS
    ) external returns (
        uint _baseTokenReceived,
        uint _interestFeeAmount
    ) {
        require(ShortSellRepo(REPO).containsShort(shortId));

        Short memory short = getShortObject(shortId);

        require(short.seller == msg.sender);

        uint interestFee = calculateInterestFee(short.interestRate, short.startTimestamp);

        uint buybackCost = buyBackUnderlyingToken(
            short,
            shortId,
            interestFee,
            orderAddresses,
            orderValues,
            orderV,
            orderR,
            orderS
        );

        uint sellerBaseTokenAmount = sendTokensOnClose(
            short,
            shortId,
            interestFee
        );

        cleanupShort(
            short,
            shortId
        );

        ShortClosed(
            shortId,
            interestFee,
            sellerBaseTokenAmount,
            buybackCost,
            block.timestamp
        );

        return (
            sellerBaseTokenAmount,
            interestFee
        );
    }

    /**
     * Call in a short sell loan.
     * Only callable by the lender for a short sell. After loan is called in, the short seller
     * will have time equal to the call time limit specified on the original short sell to
     * close the short and repay the loan. If the short seller does not close the short, the
     * lender can use forceRecoverLoan to recover his funds.
     *
     * @param  shortId  unique id for the short sell
     */
    function callInLoan(
        bytes32 shortId
    ) external {
        require(ShortSellRepo(REPO).containsShort(shortId));
        Short memory short = getShortObject(shortId);
        require(msg.sender == short.lender);
        require(block.timestamp >= safeAdd(short.startTimestamp, short.lockoutTime));

        require(
            uint(uint32(block.timestamp))
            == block.timestamp
        );

        ShortSellRepo(REPO).setShortCallStart(shortId, uint32(block.timestamp));

        LoanCalled(
            shortId,
            block.timestamp
        );
    }

    /**
     * Cancel a loan call. Only callable by the short sell's lender
     *
     * @param  shortId  unique id for the short sell
     */
    function cancelLoanCall(
        bytes32 shortId
    ) external {
        require(ShortSellRepo(REPO).containsShort(shortId));
        Short memory short = getShortObject(shortId);
        require(msg.sender == short.lender);

        ShortSellRepo(REPO).setShortCallStart(shortId, 0);

        LoanCallCanceled(
            shortId,
            block.timestamp
        );
    }

    /**
     * Function callable by a short sell lender after he has called in the loan, but the
     * short seller did not close the short sell before the call time limit. Used to recover the
     * lender's original loaned amount of underlying token as well as any owed interest fee
     *
     * @param  shortId  unique id for the short sell
     */
    function forceRecoverLoan(
        bytes32 shortId
    ) external returns (uint _baseTokenAmount) {
        // TODO decide best method to do this. Seller suplies order or auto market maker
        // for now simple implementation of giving lender all funds

        require(ShortSellRepo(REPO).containsShort(shortId));
        Short memory short = getShortObject(shortId);
        require(msg.sender == short.lender);
        require(short.callTimestamp != 0);
        require(safeAdd(uint(short.callTimestamp), uint(short.callTimeLimit)) < block.timestamp);

        uint baseTokenAmount = Vault(VAULT).balances(shortId, short.baseToken);
        Vault(VAULT).send(
            shortId,
            short.baseToken,
            short.lender,
            baseTokenAmount
        );

        cleanupShort(
            short,
            shortId
        );

        LoanForceRecovered(
            shortId,
            baseTokenAmount,
            block.timestamp
        );

        return baseTokenAmount;
    }

    /**
     * Deposit additional base token as colateral for a short sell loan. Only callable by
     * the short seller
     *
     * @param  shortId          unique id for the short sell
     * @param  depositAmount    additional amount in base token to deposit
     */
    function deposit(
        bytes32 shortId,
        uint depositAmount
    ) external {
        require(ShortSellRepo(REPO).containsShort(shortId));
        Short memory short = getShortObject(shortId);
        require(msg.sender == short.lender);

        Vault(VAULT).transfer(shortId, short.baseToken, short.lender, depositAmount);

        AdditionalDeposit(
            shortId,
            depositAmount,
            block.timestamp
        );
    }

    // -------------------------------------
    // ----- Public Constant Functions -----
    // -------------------------------------

    function getShort(
        bytes32 shortId
    ) constant public returns (
        address underlyingToken,
        address baseToken,
        uint shortAmount,
        uint interestRate,
        uint callTimeLimit,
        uint lockoutTime,
        uint startTimestamp,
        uint callTimestamp,
        address lender,
        address seller
    ) {
        return ShortSellRepo(REPO).getShort(shortId);
    }

    function containsShort(
        bytes32 shortId
    ) constant public returns (
        bool exists
    ) {
        return ShortSellRepo(REPO).containsShort(shortId);
    }

    function getShortBalance(
        bytes32 shortId
    ) constant public returns (
        uint _baseTokenBalance
    ) {
        if (!ShortSellRepo(REPO).containsShort(shortId)) {
            return 0;
        }
        Short memory short = getShortObject(shortId);

        return Vault(VAULT).balances(shortId, short.baseToken);
    }

    function getShortInterestFee(
        bytes32 shortId
    ) constant public returns (
        uint _interestFeeOwed
    ) {
        if (!ShortSellRepo(REPO).containsShort(shortId)) {
            return 0;
        }
        Short memory short = getShortObject(shortId);

        return calculateInterestFee(
            short.interestRate,
            short.startTimestamp
        );
    }

    // --------------------------------
    // ------ Internal Functions ------
    // --------------------------------

    function getNextShortId(
        address lender
    ) internal constant returns (
        bytes32 _shortId
    ) {
        return sha3(
            lender,
            loanNumbers[lender]
        );
    }

    function isValidSignature(
        LoanOffering loanOffering
    ) constant internal returns (
        bool _isValid
    ) {
        return loanOffering.lender == ecrecover(
            sha3("\x19Ethereum Signed Message:\n32", loanOffering.loanHash),
            loanOffering.signature.v,
            loanOffering.signature.r,
            loanOffering.signature.s
        );
    }

    function validateShort(
        ShortTx transaction,
        bytes32 shortId
    ) internal constant returns (
        uint _maxLoanAmount
    ) {
        require(!containsShort(shortId));

        if (transaction.loanOffering.taker != address(0)) {
            require(msg.sender == transaction.loanOffering.taker);
        }

        require(
            isValidSignature(transaction.loanOffering)
        );

        uint maxLoanAmount;

        if (loanAmounts[transaction.loanOffering.loanHash].seen) {
            maxLoanAmount = loanAmounts[transaction.loanOffering.loanHash].remaining;
        } else {
            maxLoanAmount = transaction.loanOffering.rates.maxAmount;
        }
        require(transaction.shortAmount <= maxLoanAmount);
        require(transaction.shortAmount >= transaction.loanOffering.rates.minAmount);

        uint minimumDeposit = getPartialAmount(
            transaction.shortAmount,
            transaction.loanOffering.rates.maxAmount,
            transaction.loanOffering.rates.minimumDeposit
        );

        require(transaction.depositAmount >= minimumDeposit);
        require(transaction.loanOffering.expirationTimestamp > block.timestamp);

        return maxLoanAmount;
    }

    function executeSell(
        ShortTx transaction,
        bytes32 shortId
    ) internal returns (
        uint _baseTokenReceived
    ) {
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

        return baseTokenReceived;
    }

    function getLoanOfferingHash(
        ShortTx transaction
    ) internal constant returns (
        bytes32 _hash
    ) {
        return sha3(
            address(this),
            transaction.underlyingToken,
            transaction.baseToken,
            transaction.loanOffering.lender,
            transaction.loanOffering.taker,
            transaction.loanOffering.feeRecipient,
            transaction.loanOffering.lenderFeeToken,
            transaction.loanOffering.takerFeeToken,
            getValuesHash(transaction.loanOffering)
        );
    }

    function getValuesHash(
        LoanOffering loanOffering
    ) internal constant returns (
        bytes32 _hash
    ) {
        return sha3(
            loanOffering.rates.minimumDeposit,
            loanOffering.rates.maxAmount,
            loanOffering.rates.minAmount,
            loanOffering.rates.interestRate,
            loanOffering.rates.lenderFee,
            loanOffering.rates.takerFee,
            loanOffering.expirationTimestamp,
            loanOffering.lockoutTime,
            loanOffering.callTimeLimit,
            loanOffering.salt
        );
    }

    function transferLoanFees(
        ShortTx transaction
    ) internal {
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

    function recordShortInitiated(
        bytes32 shortId,
        address shortSeller,
        ShortTx transaction,
        uint baseTokenReceived
    ) internal {
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

    function calculateInterestFee(
        uint interestRate,
        uint startTimestamp
    ) internal constant returns (
        uint _interestFee
    ) {
        uint timeElapsed = safeSub(block.timestamp, startTimestamp);
        return getPartialAmount(timeElapsed, 1 days, interestRate);
    }

    function buyBackUnderlyingToken(
        Short short,
        bytes32 shortId,
        uint interestFee,
        address[5] orderAddresses,
        uint[6] orderValues,
        uint8 orderV,
        bytes32 orderR,
        bytes32 orderS
    ) internal returns (
        uint _buybackCost
    ) {
        uint baseTokenPrice = getBaseTokenPriceForBuyback(
            short,
            interestFee,
            shortId,
            orderValues
        );

        transferFeeForBuyback(
            shortId,
            orderValues,
            orderAddresses[4],
            baseTokenPrice
        );

        var (buybackCost, ) = Trader(TRADER).trade(
            shortId,
            [
                orderAddresses[0],
                orderAddresses[1],
                short.underlyingToken,
                short.baseToken,
                orderAddresses[2],
                orderAddresses[3],
                orderAddresses[4]
            ],
            orderValues,
            baseTokenPrice,
            orderV,
            orderR,
            orderS,
            true
        );

        assert(Vault(VAULT).balances(shortId, short.underlyingToken) == short.shortAmount);

        return buybackCost;
    }

    function getBaseTokenPriceForBuyback(
        Short short,
        uint interestFee,
        bytes32 shortId,
        uint[6] orderValues
    ) internal returns (
        uint _baseTokenPrice
    ) {
        uint baseTokenPrice = getPartialAmount(
            orderValues[1],
            orderValues[0],
            short.shortAmount
        );

        require(
            safeAdd(baseTokenPrice, interestFee) <= Vault(VAULT).balances(shortId, short.baseToken)
        );

        return baseTokenPrice;
    }

    function transferFeeForBuyback(
        bytes32 shortId,
        uint[6] orderValues,
        address takerFeeToken,
        uint baseTokenPrice
    ) internal {
        uint takerFee = getPartialAmount(
            orderValues[3],
            orderValues[1],
            baseTokenPrice
        );

        // Transfer taker fee for buyback
        Vault(VAULT).transfer(
            shortId,
            takerFeeToken,
            msg.sender,
            takerFee
        );
    }

    function sendTokensOnClose(
        Short short,
        bytes32 shortId,
        uint interestFee
    ) internal returns (
        uint _sellerBaseTokenAmount
    ) {
        Vault vault = Vault(VAULT);

        // Send original loaned underlying token to lender
        vault.send(
            shortId,
            short.underlyingToken,
            short.lender,
            short.shortAmount
        );
        // Send base token interest fee to lender
        vault.send(
            shortId,
            short.baseToken,
            short.lender,
            interestFee
        );

        // Send remaining base token to seller
        // (= deposit + profit - interestFee - buyOrderTakerFee - sellOrderTakerFee)
        uint sellerBaseTokenAmount = Vault(vault).balances(shortId, short.baseToken);
        vault.send(
            shortId,
            short.baseToken,
            short.seller,
            sellerBaseTokenAmount
        );

        return sellerBaseTokenAmount;
    }

    function cleanupShort(
        Short short,
        bytes32 shortId
    ) internal {
        ShortSellRepo(REPO).deleteShort(shortId);

        Vault(VAULT).deleteBalances(
            shortId,
            short.baseToken,
            short.underlyingToken
        );
    }

    // -------- Parsing Functions -------

    function parseShortTx(
        address[12] addresses,
        uint[18] values,
        uint8[2] sigV,
        bytes32[4] sigRS
    ) internal constant returns (
        ShortTx _transaction
    ) {
        ShortTx memory transaction = ShortTx({
            underlyingToken: addresses[0],
            baseToken: addresses[1],
            shortAmount: values[16],
            depositAmount: values[17],
            loanOffering: getLoanOffering(
                addresses,
                values,
                sigV,
                sigRS
            ),
            buyOrder: getBuyOrder(
                addresses,
                values,
                sigV,
                sigRS
            )
        });

        transaction.loanOffering.loanHash = getLoanOfferingHash(transaction);

        return transaction;
    }

    function getLoanOffering(
        address[12] addresses,
        uint[18] values,
        uint8[2] sigV,
        bytes32[4] sigRS
    ) internal constant returns (
        LoanOffering _loanOffering
    ) {
        LoanOffering memory loanOffering = LoanOffering({
            lender: addresses[2],
            taker: addresses[3],
            feeRecipient: addresses[4],
            lenderFeeToken: addresses[10],
            takerFeeToken: addresses[11],
            rates: getLoanOfferRates(values),
            expirationTimestamp: values[6],
            lockoutTime: values[7],
            callTimeLimit: values[8],
            salt: values[9],
            loanHash: 0, // Set this later
            signature: getLoanOfferingSignature(sigV, sigRS)
        });

        return loanOffering;
    }

    function getLoanOfferRates(
        uint[18] values
    ) internal constant returns (
        LoanRates _loanRates
    ) {
        LoanRates memory rates = LoanRates({
            minimumDeposit: values[0],
            maxAmount: values[1],
            minAmount: values[2],
            interestRate: values[3],
            lenderFee: values[4],
            takerFee: values[5]
        });

        return rates;
    }

    function getLoanOfferingSignature(
        uint8[2] sigV,
        bytes32[4] sigRS
    ) internal constant returns (
        Signature _signature
    ) {
        Signature memory signature = Signature({
            v: sigV[0],
            r: sigRS[0],
            s: sigRS[1]
        });

        return signature;
    }

    function getBuyOrder(
        address[12] addresses,
        uint[18] values,
        uint8[2] sigV,
        bytes32[4] sigRS
    ) internal constant returns (
        BuyOrder _buyOrder
    ) {
        BuyOrder memory order = BuyOrder({
            maker: addresses[5],
            taker: addresses[6],
            feeRecipient: addresses[7],
            makerFeeToken: addresses[8],
            takerFeeToken: addresses[9],
            baseTokenAmount: values[10],
            underlyingTokenAmount: values[11],
            makerFee: values[12],
            takerFee: values[13],
            expirationTimestamp: values[14],
            salt: values[15],
            signature: getBuyOrderSignature(sigV, sigRS)
        });

        return order;
    }

    function getBuyOrderSignature(
        uint8[2] sigV,
        bytes32[4] sigRS
    ) internal constant returns (
        Signature _signature
    ) {
        Signature memory signature = Signature({
            v: sigV[1],
            r: sigRS[2],
            s: sigRS[3]
        });

        return signature;
    }

    function getShortObject(
        bytes32 shortId
    ) internal constant returns (
        Short _short
    ) {
        var (
            underlyingToken,
            baseToken,
            shortAmount,
            interestRate,
            callTimeLimit,
            lockoutTime,
            startTimestamp,
            callTimestamp,
            lender,
            seller
        ) =  ShortSellRepo(REPO).getShort(shortId);

        return Short({
            underlyingToken: underlyingToken,
            baseToken: baseToken,
            shortAmount: shortAmount,
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
