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
contract ShortSell is Ownable, SafeMath, DelayedUpdate {
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
        uint32 lockoutTime;
        uint32 callTimeLimit;
        uint salt;
        bytes32 loanHash;
        Signature signature;
    }

    struct LoanRates {
        uint minimumDeposit;
        uint minimumSellAmount;
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

    struct Short {
        address underlyingToken;
        address baseToken;
        uint shortAmount;
        uint interestRate;
        uint32 callTimeLimit;
        uint32 lockoutTime;
        uint32 startTimestamp;
        uint32 callTimestamp;
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

    mapping(bytes32 => uint) public loanFills;
    mapping(bytes32 => uint) public loanCancels;
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
        uint32 lockoutTime,
        uint32 callTimeLimit,
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
        address _proxy,
        uint _updateDelay,
        uint _updateExpiration
    )
        Ownable()
        DelayedUpdate(_updateDelay, _updateExpiration)
    {
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
    )
        onlyOwner
        delayedAddressUpdate("TRADER", _trader)
        external
    {
        TRADER = _trader;
    }

    function updateProxy(
        address _proxy
    )
        onlyOwner
        delayedAddressUpdate("PROXY", _proxy)
        external
    {
        PROXY = _proxy;
    }

    function updateVault(
        address _vault
    )
        onlyOwner
        delayedAddressUpdate("VAULT", _vault)
        external
    {
        VAULT = _vault;
    }

    function updateRepo(
        address _repo
    )
        onlyOwner
        delayedAddressUpdate("REPO", _repo)
        external
    {
        REPO = _repo;
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
     *  [3] = loan taker
     *  [4] = loan fee recipient
     *  [5] = loan lender fee token
     *  [6] = loan taker fee token
     *  [7] = buy order maker
     *  [8] = buy order taker
     *  [9] = buy order fee recipient
     *  [10] = buy order maker fee token
     *  [11] = buy order taker fee token
     *
     * @param  values256  Values corresponding to:
     *
     *  [0]  = loan minimum deposit
     *  [1]  = loan maximum amount
     *  [2]  = loan minimum amount
     *  [3]  = loan minimum sell amount
     *  [4]  = loan interest rate
     *  [5]  = loan lender fee
     *  [6]  = loan taker fee
     *  [7]  = loan expiration timestamp (in seconds)
     *  [8]  = loan salt
     *  [9]  = buy order base token amount
     *  [10] = buy order underlying token amount
     *  [11] = buy order maker fee
     *  [12] = buy order taker fee
     *  [13] = buy order expiration timestamp (in seconds)
     *  [14] = buy order salt
     *  [15] = short amount
     *  [16] = deposit amount
     *
     * @param  values32  Values corresponding to:
     *
     *  [0] = loan lockout time (in seconds)
     *  [1] = loan call time limit (in seconds)
     *
     * @param  sigV       ECDSA v parameters for [0] loan and [1] buy order
     * @param  sigRS      CDSA r and s parameters for [0] loan and [1] buy order
     * @return _shortId   unique identifier for the short sell
     */
    function short(
        address[12] addresses,
        uint[17] values256,
        uint32[2] values32,
        uint8[2] sigV,
        bytes32[4] sigRS
    ) external returns(bytes32 _shortId) {
        ShortTx memory transaction = parseShortTx(
            addresses,
            values256,
            values32,
            sigV,
            sigRS
        );

        bytes32 shortId = getNextShortId(transaction.loanOffering.lender);

        // Validate
        validateShort(
            transaction,
            shortId
        );

        // STATE UPDATES

        // Update global amounts for the loan and lender
        loanFills[transaction.loanOffering.loanHash] = safeAdd(
            loanFills[transaction.loanOffering.loanHash],
            transaction.shortAmount
        );
        loanNumbers[transaction.loanOffering.lender] =
            safeAdd(loanNumbers[transaction.loanOffering.lender], 1);

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

        // EXTERNAL CALLS

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
            uint(uint32(block.timestamp)) == block.timestamp
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

    /**
     * Cancel an amount of a loan offering. Only callable by the offering's lender.
     *
     * @param  addresses        Array of addresses:
     *
     *  [0] = underlying token
     *  [1] = base token
     *  [2] = lender
     *  [3] = loan taker
     *  [4] = loan fee recipient
     *  [5] = loan lender fee token
     *  [6] = loan taker fee token
     *
     * @param  values256        Values corresponding to:
     *
     *  [0]  = loan minimum deposit
     *  [1]  = loan maximum amount
     *  [2]  = loan minimum amount
     *  [3]  = loan minimum sell amount
     *  [4]  = loan interest rate
     *  [5]  = loan lender fee
     *  [6]  = loan taker fee
     *  [7]  = loan expiration timestamp (in seconds)
     *  [8]  = loan salt
     *  [9]  = buy order base token amount
     *
     * @param  values32         Values corresponding to:
     *
     *  [0] = loan lockout time (in seconds)
     *  [1] = loan call time limit (in seconds)
     *
     * @param  cancelAmount     Amount to cancel
     * @return _cancelledAmount Amount that was cancelled
     */
    function cancelLoanOffering(
        address[7] addresses,
        uint[9] values256,
        uint32[2] values32,
        uint cancelAmount
    ) external returns (
        uint _cancelledAmount
    ) {
        LoanOffering memory loanOffering = parseLoanOffering(
            addresses,
            values256,
            values32
        );

        require(loanOffering.lender == msg.sender);
        require(loanOffering.expirationTimestamp > block.timestamp);

        uint remainingAmount = safeSub(
            loanOffering.rates.maxAmount,
            getUnavailableLoanOfferingAmount(loanOffering.loanHash)
        );
        uint amountToCancel = min256(remainingAmount, cancelAmount);

        require(amountToCancel > 0);

        loanCancels[loanOffering.loanHash] = safeAdd(
            loanCancels[loanOffering.loanHash],
            amountToCancel
        );

        // TODO Add event

        return amountToCancel;
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

    function getUnavailableLoanOfferingAmount(
        bytes32 loanHash
    ) constant public returns (
        uint _unavailableAmount
    ) {
        return safeAdd(loanFills[loanHash], loanCancels[loanHash]);
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
    ) internal constant {
        // Make sure we don't already have this short id
        require(!containsShort(shortId));

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
            safeAdd(
                transaction.shortAmount,
                getUnavailableLoanOfferingAmount(transaction.loanOffering.loanHash)
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
            safeMul(
                transaction.loanOffering.rates.minimumSellAmount,
                transaction.buyOrder.underlyingTokenAmount
            ) <= safeMul(
                transaction.loanOffering.rates.maxAmount,
                transaction.buyOrder.baseTokenAmount
            )
        );
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

        Vault vault = Vault(VAULT);

        // Should hold base token == deposit amount + base token from sell
        assert(
            vault.balances(
                shortId,
                transaction.baseToken
            ) == safeAdd(baseTokenReceived, transaction.depositAmount)
        );

        // Should hold 0 underlying token
        assert(vault.balances(shortId, transaction.underlyingToken) == 0);

        return baseTokenReceived;
    }

    function getLoanOfferingHash(
        LoanOffering loanOffering,
        address baseToken,
        address underlyingToken
    ) internal constant returns (
        bytes32 _hash
    ) {
        return sha3(
            address(this),
            underlyingToken,
            baseToken,
            loanOffering.lender,
            loanOffering.taker,
            loanOffering.feeRecipient,
            loanOffering.lenderFeeToken,
            loanOffering.takerFeeToken,
            getValuesHash(loanOffering)
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
            loanOffering.rates.minimumSellAmount,
            loanOffering.rates.interestRate,
            loanOffering.rates.lenderFee,
            loanOffering.rates.takerFee,
            loanOffering.expirationTimestamp,
            loanOffering.lockoutTime,
            loanOffering.callTimeLimit,
            loanOffering.salt
        );
    }

    function transferTokensForShort(
        bytes32 shortId,
        ShortTx transaction
    ) internal {
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
    ) internal {
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

        if (orderAddresses[2] != address(0)) {
            transferFeeForBuyback(
                shortId,
                orderValues,
                orderAddresses[4],
                baseTokenPrice
            );
        }

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
        assert(Vault(VAULT).balances(shortId, orderAddresses[4]) == 0);

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
            baseTokenPrice,
            orderValues[1],
            orderValues[3]
        );

        // Transfer taker fee for buyback
        if (takerFee > 0) {
            Vault(VAULT).transfer(
                shortId,
                takerFeeToken,
                msg.sender,
                takerFee
            );
        }
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
        if (interestFee > 0) {
            vault.send(
                shortId,
                short.baseToken,
                short.lender,
                interestFee
            );
        }

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
        uint[17] values,
        uint32[2] values32,
        uint8[2] sigV,
        bytes32[4] sigRS
    ) internal constant returns (
        ShortTx _transaction
    ) {
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
    ) internal constant returns (
        LoanOffering _loanOffering
    ) {
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
            loanHash: 0, // Set this later
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
    ) internal constant returns (
        LoanRates _loanRates
    ) {
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

    function parseLoanOffering(
        address[7] addresses,
        uint[9] values,
        uint32[2] values32
    ) internal constant returns (
        LoanOffering _loanOffering
    ) {
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
            signature: Signature({
                v: 0,
                r: "0x",
                s: "0x"
            })
        });

        loanOffering.loanHash = getLoanOfferingHash(
            loanOffering,
            addresses[1],
            addresses[0]
        );

        return loanOffering;
    }

    function parseLoanOfferRates(
        uint[9] values
    ) internal constant returns (
        LoanRates _loanRates
    ) {
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

    function parseBuyOrder(
        address[12] addresses,
        uint[17] values,
        uint8[2] sigV,
        bytes32[4] sigRS
    ) internal constant returns (
        BuyOrder _buyOrder
    ) {
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
