const expect = require('chai').expect;
const ZeroEx = require('0x.js').ZeroEx;
const promisify = require("es6-promisify");
const Web3 = require('web3');
const BigNumber = require('bignumber.js');
const ethUtil = require('ethereumjs-util');

const ShortSell = artifacts.require("ShortSell");
const BaseToken = artifacts.require("TokenA");
const UnderlyingToken = artifacts.require("TokenB");
const ZrxToken = artifacts.require("ZrxToken");
const ZeroExProxy = artifacts.require("ZeroExProxy");
const ZeroExExchange = artifacts.require("ZeroExExchange");
const ProxyContract = artifacts.require("Proxy");
const Vault = artifacts.require("Vault");

const web3Instance = new Web3(web3.currentProvider);
const zeroEx = new ZeroEx(web3.currentProvider);

const BASE_AMOUNT = new BigNumber('1e18');

async function createShortSellTx(accounts) {
    const [loanOffering, buyOrder] = await Promise.all([
        createLoanOffering(accounts),
        createSigned0xOrder(accounts)
    ]);

    const tx = {
        underlyingToken: UnderlyingToken.address,
        baseToken: BaseToken.address,
        shortAmount: BASE_AMOUNT,
        depositAmount: BASE_AMOUNT.times(new BigNumber(2)),
        loanOffering: loanOffering,
        buyOrder: buyOrder,
        seller: accounts[0]
    };

    return tx;
}

async function createSigned0xOrder(accounts) {
    // 3 baseToken : 1 underlyingToken rate
    let order = {
    	exchangeContractAddress: ZeroExExchange.address,
    	expirationUnixTimestampSec: new BigNumber(100000000000000),
    	feeRecipient: accounts[4],
    	maker: accounts[2],
    	makerFee: new BigNumber(0),
    	makerTokenAddress: BaseToken.address,
    	makerTokenAmount: BASE_AMOUNT.times(new BigNumber(6)),
    	salt: new BigNumber(7324),
    	taker: ZeroEx.NULL_ADDRESS,
    	takerFee: BASE_AMOUNT.times(new BigNumber(.1)),
    	takerTokenAddress: UnderlyingToken.address,
    	takerTokenAmount: BASE_AMOUNT.times(new BigNumber(2)),
    };

    const orderHash = ZeroEx.getOrderHashHex(order);

    const signature = await zeroEx.signOrderHashAsync(orderHash, accounts[2]);

    order.ecSignature = signature;

    return order;
}

async function createLoanOffering(accounts) {
    let loanOffering = {
        lender: accounts[1],
        feeRecipient: accounts[3],
        rates: {
            minimumDeposit: BASE_AMOUNT,
            maxAmount: BASE_AMOUNT.times(new BigNumber(3)),
            minAmount: BASE_AMOUNT.times(new BigNumber(.1)),
            interestRate: BASE_AMOUNT.times(new BigNumber(.1)),
            lenderFee: BASE_AMOUNT.times(new BigNumber(.01)),
            takerFee: BASE_AMOUNT.times(new BigNumber(.02))
        },
        expirationTimestamp: 1000000000000,
        lockoutTime: 100000,
        callTimeLimit: 100000,
        salt: 123
    };

    loanOffering.signature = await signLoanOffering(loanOffering);

    return loanOffering;
}

async function signLoanOffering(loanOffering) {
    const valuesHash = web3Instance.utils.soliditySha3(
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
    const hash = web3Instance.utils.soliditySha3(
        ShortSell.address,
        UnderlyingToken.address,
        BaseToken.address,
        loanOffering.lender,
        loanOffering.feeRecipient,
        valuesHash
    );

    const signature = await promisify(web3Instance.eth.sign)(
        hash, loanOffering.lender
    );

    const { v, r, s } = ethUtil.fromRpcSig(signature);

    return {
        v,
        r: ethUtil.bufferToHex(r),
        s: ethUtil.bufferToHex(s)
    }
}

function callShort(shortSell, tx) {
    const addresses = [
        UnderlyingToken.address,
        BaseToken.address,
        tx.loanOffering.lender,
        tx.loanOffering.feeRecipient,
        tx.buyOrder.maker,
        tx.buyOrder.taker,
        tx.buyOrder.feeRecipient
    ];

    const values = [
        tx.loanOffering.rates.minimumDeposit,
        tx.loanOffering.rates.maxAmount,
        tx.loanOffering.rates.minAmount,
        tx.loanOffering.rates.interestRate,
        tx.loanOffering.rates.lenderFee,
        tx.loanOffering.rates.takerFee,
        tx.loanOffering.expirationTimestamp,
        tx.loanOffering.lockoutTime,
        tx.loanOffering.callTimeLimit,
        tx.loanOffering.salt,
        tx.buyOrder.makerTokenAmount,
        tx.buyOrder.takerTokenAmount,
        tx.buyOrder.makerFee,
        tx.buyOrder.takerFee,
        tx.buyOrder.expirationUnixTimestampSec,
        tx.buyOrder.salt,
        tx.shortAmount,
        tx.depositAmount
    ];

    const sigV = [
        tx.loanOffering.signature.v,
        tx.buyOrder.ecSignature.v
    ];

    const sigRS = [
        tx.loanOffering.signature.r,
        tx.loanOffering.signature.s,
        tx.buyOrder.ecSignature.r,
        tx.buyOrder.ecSignature.s
    ];

    return shortSell.short(
        addresses,
        values,
        sigV,
        sigRS,
        { from: tx.seller }
    );
}

async function issueTokensAndSetAllowancesForShort(tx) {
    const [underlyingToken, baseToken, zrxToken] = await Promise.all([
        UnderlyingToken.deployed(),
        BaseToken.deployed(),
        ZrxToken.deployed()
    ]);

    await Promise.all([
        underlyingToken.issueTo(
            tx.loanOffering.lender,
            tx.loanOffering.rates.maxAmount
        ),
        baseToken.issueTo(
            tx.seller,
            tx.depositAmount
        ),
        baseToken.issueTo(
            tx.buyOrder.maker,
            tx.buyOrder.makerTokenAmount
        ),
        zrxToken.issueTo(
            tx.seller,
            tx.buyOrder.takerFee
        ),
        zrxToken.issueTo(
            tx.buyOrder.maker,
            tx.buyOrder.makerFee
        )
    ]);

    return Promise.all([
        underlyingToken.approve(
            ProxyContract.address,
            tx.loanOffering.rates.maxAmount,
            { from: tx.loanOffering.lender }
        ),
        baseToken.approve(
            ProxyContract.address,
            tx.depositAmount,
            { from: tx.seller }
        ),
        baseToken.approve(
            ZeroExProxy.address,
            tx.buyOrder.makerTokenAmount,
            { from: tx.buyOrder.maker }
        ),
        zrxToken.approve(
            ProxyContract.address,
            tx.buyOrder.takerFee,
            { from: tx.seller }
        ),
        zrxToken.approve(
            ZeroExProxy.address,
            tx.buyOrder.makerFee,
            { from: tx.buyOrder.maker }
        )
    ]);
}

contract('ShortSell', function(accounts) {
    it("should not contain nonexistent shorts", async () => {
        const shortSell = await ShortSell.deployed();
        const result = await shortSell.containsShort.call('0x');
        expect(result).to.equal(false);
    });

    it('short succeeds on valid inputs', async () => {
        const shortTx = await createShortSellTx(accounts);
        const shortSell = await ShortSell.deployed();

        await issueTokensAndSetAllowancesForShort(shortTx);

        const tx = await callShort(shortSell, shortTx);

        console.log('ShortSell.short gas used: ' + tx.receipt.gasUsed);

        const shortId = web3Instance.utils.soliditySha3(
            shortTx.loanOffering.lender,
            0
        );

        const contains = await shortSell.containsShort.call(shortId);
        expect(contains).to.equal(true);
        const [
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
        ] = await shortSell.getShort.call(shortId);

        expect(underlyingToken).to.equal(shortTx.underlyingToken);
        expect(baseToken).to.equal(shortTx.baseToken);
        expect(shortAmount.equals(shortTx.shortAmount)).to.equal(true);
        expect(interestRate.equals(shortTx.loanOffering.rates.interestRate)).to.equal(true);
        expect(callTimeLimit.equals(shortTx.loanOffering.callTimeLimit)).to.equal(true);
        expect(lockoutTime.equals(shortTx.loanOffering.lockoutTime)).to.equal(true);
        expect(lender).to.equal(shortTx.loanOffering.lender);
        expect(seller).to.equal(shortTx.seller);
    });
});
