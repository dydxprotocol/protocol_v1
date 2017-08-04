pragma solidity ^0.4.13;

import './lib/Ownable.sol';
import './lib/SafeMath.sol';
import './Vault.sol';
import './ShortSellRepo.sol';

/**
 * @title ShortSell
 * @author Antonio Juliano
 *
 * This contract is used to facilitate short selling as per the dYdX short sell protocol
 */
contract ShortSell is Ownable, SafeMath {
    address public ZRX_TOKEN_CONTRACT;
    uint8 public constant REPO_VERSION = 1;

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
        address feeRecipient;
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
        uint8 version;
    }

    // ---------------------------
    // ----- State Variables -----
    // ---------------------------

    // Address of the Vault contract
    address public vault;

    // Address of the ShortSellRepo contract
    address public repo;

    mapping(bytes32 => LoanAmount) public loanAmounts;
    mapping(address => uint) public loanNumbers;

    // ------------------------
    // -------- Events --------
    // ------------------------

    /**
     * A short sell occurred
     */
    // TODO is this event too big? [omitted fee details]
    event ShortInitiated(
        bytes32 indexed id,
        address indexed shortSeller,
        address indexed lender,
        address underlyingToken,
        address baseToken,
        uint shortAmount,
        uint baseTokenFromSell,
        uint depositAmount,
        uint lockoutTime,
        uint callTimeLimit,
        uint interestRate,
        uint timestamp // ??? are timestamps needed
    );

    /**
     * A short sell was closed
     */
    event ShortClosed(
        bytes32 indexed id,
        uint interestFee,
        uint shortSellerBaseToken,
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
        address _ZRX_TOKEN_CONTRACT,
        address _repo
    ) Ownable() {
        vault = _vault;
        ZRX_TOKEN_CONTRACT = _ZRX_TOKEN_CONTRACT;
        repo = _repo;
    }

    // -----------------------------------------
    // ---- Public State Changing Functions ----
    // -----------------------------------------

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
     *  [3] = loan fee recipient
     *  [4] = buy order maker
     *  [5] = buy order taker
     *  [6] = buy order fee recipient
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
        address[7] addresses,
        uint[18] values,
        uint8[2] sigV,
        bytes32[4] sigRS
    ) external returns(bytes32 _shortId) {
        // TODO: lender, taker fees on loan offer

        // TODO understand memory vs storage better. Should this be storage? want to just
        // pass around a pointer to it
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
        // Transfer deposit
        Vault(vault).transfer(
            shortId,
            transaction.baseToken,
            msg.sender,
            transaction.depositAmount
        );

        // Transfer underlying token
        Vault(vault).transfer(
            shortId,
            transaction.underlyingToken,
            addresses[2],
            transaction.shortAmount
        );

        // TODO check this is right amount
        uint tradeTakerFee = getPartialAmount(
            transaction.shortAmount,
            transaction.buyOrder.underlyingTokenAmount,
            transaction.buyOrder.takerFee
        );

        // Transfer ZRX taker fee for sell
        if (tradeTakerFee > 0) {
            Vault(vault).transfer(
                shortId,
                ZRX_TOKEN_CONTRACT,
                msg.sender,
                tradeTakerFee
            );
        }

        // Do the sell
        uint baseTokenReceived = executeSell(
            transaction,
            shortId
        );

        // Should hold base token == deposit amount + base token from sell
        assert(
            Vault(vault).balances(
                shortId,
                transaction.baseToken
            ) == safeAdd(baseTokenReceived, transaction.depositAmount)
        );

        // Should hold 0 underlying token and ZRX token
        assert(Vault(vault).balances(shortId, transaction.underlyingToken) == 0);
        assert(Vault(vault).balances(shortId, ZRX_TOKEN_CONTRACT) == 0);


        ShortSellRepo(repo).addShort(
            shortId,
            transaction.underlyingToken,
            transaction.baseToken,
            transaction.shortAmount,
            transaction.loanOffering.rates.interestRate,
            transaction.loanOffering.callTimeLimit,
            transaction.loanOffering.lockoutTime,
            block.timestamp,
            transaction.loanOffering.lender,
            msg.sender,
            REPO_VERSION
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
        address[3] orderAddresses,
        uint[6] orderValues,
        uint8 orderV,
        bytes32 orderR,
        bytes32 orderS
    ) external returns (
        uint _baseTokenReceived,
        uint _interestFeeAmount
    ) {
        require(ShortSellRepo(repo).containsShort(shortId));

        Short memory short = getShortObject(shortId);

        require(short.seller == msg.sender);
        require(short.version == REPO_VERSION);

        uint interestFee = calculateInterestFee(short.interestRate, short.startTimestamp);

        buyBackUnderlyingToken(
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
        require(ShortSellRepo(repo).containsShort(shortId));
        Short memory short = getShortObject(shortId);
        require(msg.sender == short.lender);
        require(block.timestamp >= safeAdd(short.startTimestamp, short.lockoutTime));

        ShortSellRepo(repo).setShortCallStart(shortId, block.timestamp);

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
        require(ShortSellRepo(repo).containsShort(shortId));
        Short memory short = getShortObject(shortId);
        require(msg.sender == short.lender);

        ShortSellRepo(repo).setShortCallStart(shortId, 0);

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

        require(ShortSellRepo(repo).containsShort(shortId));
        Short memory short = getShortObject(shortId);
        require(msg.sender == short.lender);
        require(short.callTimestamp != 0);
        require(safeAdd(short.callTimestamp, short.callTimeLimit) < block.timestamp);

        uint baseTokenAmount = Vault(vault).balances(shortId, short.baseToken);
        Vault(vault).send(
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
        require(ShortSellRepo(repo).containsShort(shortId));
        Short memory short = getShortObject(shortId);
        require(msg.sender == short.lender);

        Vault(vault).transfer(shortId, short.baseToken, short.lender, depositAmount);

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
        address seller,
        uint8 version
    ) {
        return ShortSellRepo(repo).getShort(shortId);
    }

    function containsShort(
        bytes32 shortId
    ) constant public returns (
        bool exists
    ) {
        return ShortSellRepo(repo).containsShort(shortId);
    }

    function getShortBalance(
        bytes32 shortId
    ) constant public returns (
        uint _baseTokenBalance
    ) {
        if (!ShortSellRepo(repo).containsShort(shortId)) {
            return 0;
        }
        Short memory short = getShortObject(shortId);

        return Vault(vault).balances(shortId, short.baseToken);
    }

    function getShortInterestFee(
        bytes32 shortId
    ) constant public returns (
        uint _interestFeeOwed
    ) {
        if (!ShortSellRepo(repo).containsShort(shortId)) {
            return 0;
        }
        Short memory short = getShortObject(shortId);

        return calculateInterestFee(
            short.interestRate,
            short.startTimestamp
        );
    }

    function getPartialAmount(
        uint numerator,
        uint denominator,
        uint target
    ) constant public returns (
        uint partialValue
    ) {
        return safeDiv(safeMul(numerator, target), denominator);
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
        var ( , baseTokenReceived) = Vault(vault).trade(
            shortId,
            [
                transaction.buyOrder.maker,
                transaction.buyOrder.taker,
                transaction.baseToken,
                transaction.underlyingToken,
                transaction.buyOrder.feeRecipient
            ],
            [
                transaction.buyOrder.baseTokenAmount,
                transaction.buyOrder.underlyingTokenAmount,
                transaction.buyOrder.makerFee,
                transaction.buyOrder.takerFee,
                transaction.buyOrder.expirationTimestamp,
                transaction.buyOrder.salt
            ],
            transaction.shortAmount, // short amount
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
            transaction.loanOffering.feeRecipient,
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
        address[3] orderAddresses,
        uint[6] orderValues,
        uint8 orderV,
        bytes32 orderR,
        bytes32 orderS
    ) internal {
        uint tradeTakerFee = getPartialAmount(
            short.shortAmount,
            orderValues[0],
            orderValues[3]
        );

        if (tradeTakerFee > 0) {
            Vault(vault).transfer(shortId, ZRX_TOKEN_CONTRACT, msg.sender, tradeTakerFee);
        }

        uint baseTokenPrice = getPartialAmount(
            orderValues[1],
            orderValues[0],
            short.shortAmount
        );

        require(
            safeAdd(baseTokenPrice, interestFee)
            <= Vault(vault).balances(shortId, short.baseToken)
        );

        Vault(vault).trade(
            shortId,
            [
                orderAddresses[0],
                orderAddresses[1],
                short.underlyingToken,
                short.baseToken,
                orderAddresses[2]
            ],
            orderValues,
            baseTokenPrice,
            orderV,
            orderR,
            orderS,
            true
        );

        assert(Vault(vault).balances(shortId, short.underlyingToken) == short.shortAmount);
    }

    function sendTokensOnClose(
        Short short,
        bytes32 shortId,
        uint interestFee
    ) internal returns (
        uint _sellerBaseTokenAmount
    ) {
        // Send original loaned underlying token to lender
        Vault(vault).send(
            shortId,
            short.underlyingToken,
            short.lender,
            short.shortAmount
        );
        // Send base token interest fee to lender
        Vault(vault).send(
            shortId,
            short.baseToken,
            short.lender,
            interestFee
        );

        // Send remaining base token (== deposit + profit - interestFee) to seller
        uint sellerBaseTokenAmount = Vault(vault).balances(shortId, short.baseToken);
        Vault(vault).send(
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
        ShortSellRepo(repo).deleteShort(shortId);

        Vault(vault).deleteBalances(
            shortId,
            short.baseToken,
            short.underlyingToken
        );
    }

    // -------- Parsing Functions -------

    function parseShortTx(
        address[7] addresses,
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
        address[7] addresses,
        uint[18] values,
        uint8[2] sigV,
        bytes32[4] sigRS
    ) internal constant returns (
        LoanOffering _loanOffering
    ) {
        LoanOffering memory loanOffering = LoanOffering({
            lender: addresses[2],
            feeRecipient: addresses[3],
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
        address[7] addresses,
        uint[18] values,
        uint8[2] sigV,
        bytes32[4] sigRS
    ) internal constant returns (
        BuyOrder _buyOrder
    ) {
        BuyOrder memory order = BuyOrder({
            maker: addresses[4],
            taker: addresses[5],
            feeRecipient: addresses[6],
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
            seller,
            version
        ) =  ShortSellRepo(repo).getShort(shortId);

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
            seller: seller,
            version: version
        });
    }
}
