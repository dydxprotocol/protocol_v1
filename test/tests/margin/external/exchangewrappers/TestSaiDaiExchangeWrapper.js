const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());
const BigNumber = require('bignumber.js');

const SaiDaiExchangeWrapper = artifacts.require("SaiDaiExchangeWrapper");
const TestScdMcdMigration = artifacts.require("TestScdMcdMigration");
const TokenA = artifacts.require("TokenA");
const TokenB = artifacts.require("TokenB");
const TokenC = artifacts.require("TokenC");

const { BIGNUMBERS } = require('../../../../helpers/Constants');
const { expectThrow } = require('../../../../helpers/ExpectHelper');
const { transact } = require('../../../../helpers/ContractHelper');

const EMPTY_BYTES = '0x';
const DEFAULT_AMOUNT = new BigNumber('1e18');

contract('SaiDaiExchangeWrapper', accounts => {
  let SAI, DAI, RANDOM_TOKEN, SDEW, TestMigrationContract;

  beforeEach('Sets up the contracts', async () => {
    [
      SAI,
      DAI,
      RANDOM_TOKEN,
    ] = await Promise.all([
      TokenA.new(),
      TokenB.new(),
      TokenC.new(),
    ]);
    TestMigrationContract = await TestScdMcdMigration.new(
      SAI.address,
      DAI.address,
    );
    SDEW = await SaiDaiExchangeWrapper.new(
      TestMigrationContract.address,
      SAI.address,
      DAI.address,
    );

    // add liquidity
    await Promise.all([
      SAI.issueTo(TestMigrationContract.address, DEFAULT_AMOUNT.times(2)),
      DAI.issueTo(TestMigrationContract.address, DEFAULT_AMOUNT.times(2)),
    ]);
  });

  describe('constructor', () => {
    it('sets constants correctly', async () => {
      const [
        saiAddress,
        daiAddress,
        migrationContractAddress,
      ] = await Promise.all([
        SDEW.SAI.call(),
        SDEW.DAI.call(),
        SDEW.MIGRATION_CONTRACT.call(),
      ]);
      expect(saiAddress).to.be.eq(SAI.address);
      expect(daiAddress).to.be.eq(DAI.address);
      expect(migrationContractAddress).to.be.eq(TestMigrationContract.address);
    });

    it('sets allowances correctly', async () => {
      const [
        saiAllowance,
        daiAllowance,
      ]  = await Promise.all([
        SAI.allowance.call(SDEW.address, TestMigrationContract.address),
        DAI.allowance.call(SDEW.address, TestMigrationContract.address),
      ]);
      expect(saiAllowance).to.be.bignumber.eq(BIGNUMBERS.MAX_UINT256);
      expect(daiAllowance).to.be.bignumber.eq(BIGNUMBERS.MAX_UINT256);
    });
  });

  describe('#getExchangeCost', () => {
    it('returns the input', async () => {
      const amount1 = new BigNumber('0');
      const amount2 = new BigNumber('1e18');
      const [
        result1,
        result2,
      ] = await Promise.all([
        SDEW.getExchangeCost.call(
          SAI.address,
          DAI.address,
          amount1,
          EMPTY_BYTES,
        ),
        SDEW.getExchangeCost.call(
          SAI.address,
          DAI.address,
          amount2,
          EMPTY_BYTES,
        ),
      ]);
      expect(result1).to.be.bignumber.eq(amount1);
      expect(result2).to.be.bignumber.eq(amount2);
    });
  });

  describe('#exchange', () => {
    it('succeeds twice for sai->dai', async () => {
      await SAI.issueTo(SDEW.address, DEFAULT_AMOUNT.times(2));
      const receipt1 = await transact(
        SDEW.exchange,
        accounts[0],
        accounts[0],
        DAI.address,
        SAI.address,
        DEFAULT_AMOUNT,
        EMPTY_BYTES,
      );
      await DAI.transferFrom(
        SDEW.address,
        accounts[0],
        DEFAULT_AMOUNT,
        { from: accounts[0] },
      );
      const receipt2 = await transact(
        SDEW.exchange,
        accounts[0],
        accounts[0],
        DAI.address,
        SAI.address,
        DEFAULT_AMOUNT,
        EMPTY_BYTES,
      );
      await DAI.transferFrom(
        SDEW.address,
        accounts[0],
        DEFAULT_AMOUNT,
        { from: accounts[0] },
      );
      expect(receipt1.result).to.be.bignumber.eq(DEFAULT_AMOUNT);
      expect(receipt2.result).to.be.bignumber.eq(DEFAULT_AMOUNT);
      const [
        migrationSaiBalance,
        migrationDaiBalance,
        userSaiBalance,
        userDaiBalance,
      ] = await Promise.all([
        SAI.balanceOf.call(TestMigrationContract.address),
        DAI.balanceOf.call(TestMigrationContract.address),
        SAI.balanceOf.call(accounts[0]),
        DAI.balanceOf.call(accounts[0]),
      ]);
      expect(migrationSaiBalance).to.be.bignumber.eq(DEFAULT_AMOUNT.times(4));
      expect(migrationDaiBalance).to.be.bignumber.eq(BIGNUMBERS.ZERO);
      expect(userSaiBalance).to.be.bignumber.eq(BIGNUMBERS.ZERO);
      expect(userDaiBalance).to.be.bignumber.eq(DEFAULT_AMOUNT.times(2));
    });

    it('succeeds twice for dai->sai', async () => {
      await DAI.issueTo(SDEW.address, DEFAULT_AMOUNT.times(2));
      const receipt1 = await transact(
        SDEW.exchange,
        accounts[0],
        accounts[0],
        SAI.address,
        DAI.address,
        DEFAULT_AMOUNT,
        EMPTY_BYTES,
      );
      await transact(SAI.transferFrom,
        SDEW.address,
        accounts[0],
        DEFAULT_AMOUNT,
        { from: accounts[0] },
      );
      const receipt2 = await transact(
        SDEW.exchange,
        accounts[0],
        accounts[0],
        SAI.address,
        DAI.address,
        DEFAULT_AMOUNT,
        EMPTY_BYTES,
      );
      await SAI.transferFrom(
        SDEW.address,
        accounts[0],
        DEFAULT_AMOUNT,
        { from: accounts[0] },
      );
      expect(receipt1.result).to.be.bignumber.eq(DEFAULT_AMOUNT);
      expect(receipt2.result).to.be.bignumber.eq(DEFAULT_AMOUNT);
      const [
        migrationSaiBalance,
        migrationDaiBalance,
        userSaiBalance,
        userDaiBalance,
      ] = await Promise.all([
        SAI.balanceOf.call(TestMigrationContract.address),
        DAI.balanceOf.call(TestMigrationContract.address),
        SAI.balanceOf.call(accounts[0]),
        DAI.balanceOf.call(accounts[0]),
      ]);
      expect(migrationSaiBalance).to.be.bignumber.eq(BIGNUMBERS.ZERO);
      expect(migrationDaiBalance).to.be.bignumber.eq(DEFAULT_AMOUNT.times(4));
      expect(userSaiBalance).to.be.bignumber.eq(DEFAULT_AMOUNT.times(2));
      expect(userDaiBalance).to.be.bignumber.eq(BIGNUMBERS.ZERO);
    });

    it('fails when trying to take too much', async () => {
      await expectThrow(
        SDEW.exchange(
          accounts[0],
          accounts[0],
          SAI.address,
          DAI.address,
          DEFAULT_AMOUNT.times(10),
          EMPTY_BYTES,
        )
      );
    });

    it('fails for other pairs', async () => {
      await expectThrow(
        SDEW.exchange(
          accounts[0],
          accounts[0],
          RANDOM_TOKEN.address,
          DAI.address,
          DEFAULT_AMOUNT,
          EMPTY_BYTES,
        )
      );
      await expectThrow(
        SDEW.exchange(
          accounts[0],
          accounts[0],
          SAI.address,
          RANDOM_TOKEN.address,
          DEFAULT_AMOUNT,
          EMPTY_BYTES,
        )
      );
      await expectThrow(
        SDEW.exchange(
          accounts[0],
          accounts[0],
          DAI.address,
          DAI.address,
          DEFAULT_AMOUNT,
          EMPTY_BYTES,
        )
      );
      await expectThrow(
        SDEW.exchange(
          accounts[0],
          accounts[0],
          SAI.address,
          SAI.address,
          DEFAULT_AMOUNT,
          EMPTY_BYTES,
        )
      );
    });
  });
});
