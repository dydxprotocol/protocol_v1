pragma solidity ^0.4.13;

import './lib/Ownable.sol';
import './Vault.sol';
import './ShortSellRepo.sol';

contract ShortSell is Ownable {
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
        uint lockoutTimestamp;
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
        uint interestRate;
        uint callTimeLimit;
        uint lockoutTimestamp;
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

    // -------------------------
    // ------ Constructor ------
    // -------------------------

    function ShortSell(
        address _owner,
        address _vault,
        address _ZRX_TOKEN_CONTRACT,
        address _repo
    ) Ownable(_owner) {
        vault = _vault;
        ZRX_TOKEN_CONTRACT = _ZRX_TOKEN_CONTRACT;
        repo = _repo;
    }

    // -----------------------------------------
    // ---- Public State Changing Functions ----
    // -----------------------------------------

    // TODO: lender, taker fees on loan offer
    /**
     * TODO
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
     *  [7] = loan lockout timestamp
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
    ) public returns(bytes32 _shortId) {
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
            maxLoanAmount - transaction.shortAmount;
        loanNumbers[transaction.loanOffering.lender] =
            loanNumbers[transaction.loanOffering.lender] + 1;

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

        // Transfer ZRX fee for sell
        if (transaction.buyOrder.takerFee > 0) {
            Vault(vault).transfer(
                shortId,
                ZRX_TOKEN_CONTRACT,
                msg.sender,
                transaction.buyOrder.takerFee
            );
        }

        // Do the sell
        uint baseTokenReceived = executeSell(
            transaction,
            shortId
        );

        // Should hold base token == deposit amount + base token from sell
        require(
            Vault(vault).balances(
                shortId,
                transaction.baseToken
            ) == baseTokenReceived + transaction.depositAmount
        );
        // Should hold 0 underlying token
        require(Vault(vault).balances(shortId, transaction.underlyingToken) == 0);

        // Send back any excess ZRX token
        if (Vault(vault).balances(shortId, ZRX_TOKEN_CONTRACT) > 0) {
            Vault(vault).send(
                shortId,
                ZRX_TOKEN_CONTRACT,
                msg.sender,
                Vault(vault).balances(shortId, ZRX_TOKEN_CONTRACT)
            );
        }

        ShortSellRepo(repo).setShort(
            shortId,
            transaction.underlyingToken,
            transaction.baseToken,
            transaction.loanOffering.rates.interestRate,
            transaction.loanOffering.callTimeLimit,
            transaction.loanOffering.lockoutTimestamp,
            transaction.loanOffering.lender,
            msg.sender,
            REPO_VERSION
        );

        return shortId;
    }

    function closeShort(
        bytes32 shortId,
        address[2] orderAddresses,
        uint[6] orderValues,
        uint8 orderV,
        bytes32 orderR,
        bytes32 orderS
    ) public returns(
        uint _baseTokenReceived
    ) {
        require(ShortSellRepo(repo).containsShort(shortId));
        Short short = parseShort(ShortSellRepo(repo).getShort(shortId));
        require(seller == msg.sender);
        require()

        uint interestFee = calculateInterestFee(short);
        Vault.transfer(shortId, ZRX_TOKEN_CONTRACT, msg.sender, orderValues[3]);

    }

    // -------------------------------------
    // ----- Public Constant Functions -----
    // -------------------------------------

    function getPartialAmount(
        uint numerator,
        uint denominator,
        uint target
    ) constant public returns (uint partialValue) {
        // TODO
        return 1;
    }

    // --------------------------------
    // ------ Internal Functions ------
    // --------------------------------

    function getNextShortId(
        address lender
    ) internal constant returns(
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
    ) internal constant returns(
        uint _maxLoanAmount
    ) {
        require(!ShortSellRepo(repo).containsShort(shortId));

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
    ) internal returns(
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
    ) internal constant returns(
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
    ) internal constant returns(
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
            loanOffering.lockoutTimestamp,
            loanOffering.callTimeLimit,
            loanOffering.salt
        );
    }

    function calculateInterestFee(
        Short short
    ) internal constant returns (
        uint _interestFee
    ) {
        // TODO
        return 1;
    }

    // -------- Parsing Functions -------

    function parseShortTx(
        address[7] addresses,
        uint[18] values,
        uint8[2] sigV,
        bytes32[4] sigRS
    ) internal constant returns(
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
    ) internal constant returns(
        LoanOffering _loanOffering
    ) {
        LoanOffering memory loanOffering = LoanOffering({
            lender: addresses[2],
            feeRecipient: addresses[3],
            rates: getLoanOfferRates(values),
            expirationTimestamp: values[6],
            lockoutTimestamp: values[7],
            callTimeLimit: values[8],
            salt: values[9],
            loanHash: 0, // Set this later
            signature: getLoanOfferingSignature(sigV, sigRS)
        });

        return loanOffering;
    }

    function getLoanOfferRates(
        uint[18] values
    ) internal constant returns(
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
    ) internal constant returns(
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
    ) internal constant returns(
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
    ) internal constant returns(
        Signature _signature
    ) {
        Signature memory signature = Signature({
            v: sigV[1],
            r: sigRS[2],
            s: sigRS[3]
        });

        return signature;
    }

    function parseShort(
        address underlyingToken,
        address baseToken,
        uint interestRate,
        uint callTimeLimit,
        uint lockoutTimestamp,
        address lender,
        address seller,
        uint8 version
    ) internal constant returns (
        Short _short
    ) {
        return Short({
            underlyingToken: underlyingToken,
            baseToken: baseToken,
            interestRate: interestRate,
            callTimeLimit: callTimeLimit,
            lockoutTimestamp: lockoutTimestamp,
            lender: lender,
            seller: seller,
            version: version
        });
    }
}
