/*global artifacts, contract, describe, it*/

const expect = require('chai').expect;

const ShortSell = artifacts.require("ShortSell");
const {
  doShort,
  getShort
} = require('../helpers/ShortSellHelper');
const { expectThrow } = require('../helpers/ExpectHelper');

describe('#transferShort', () => {
  contract('ShortSell', function(accounts) {
    const toAddress = accounts[6];
    it('transfers ownership of a short', async () => {
      const shortSell = await ShortSell.deployed();
      const shortTx = await doShort(accounts);

      await shortSell.transferShort(
        shortTx.id,
        toAddress,
        { from: shortTx.seller }
      );

      const { seller } = await getShort(shortSell, shortTx.id);

      expect(seller.toLowerCase()).to.eq(toAddress.toLowerCase());
    });
  });

  contract('ShortSell', function(accounts) {
    const toAddress = accounts[6];
    it('only allows short seller to transfer', async () => {
      const shortSell = await ShortSell.deployed();
      const shortTx = await doShort(accounts);

      await expectThrow( () => shortSell.transferShort(
        shortTx.id,
        toAddress,
        { from: toAddress }
      ));

      const { seller } = await getShort(shortSell, shortTx.id);

      expect(seller.toLowerCase()).to.eq(shortTx.seller.toLowerCase());
    });
  });
});

describe('#transferLoan', () => {
  contract('ShortSell', function(accounts) {
    const toAddress = accounts[6];
    it('transfers ownership of a loan', async () => {
      const shortSell = await ShortSell.deployed();
      const shortTx = await doShort(accounts);

      await shortSell.transferLoan(
        shortTx.id,
        toAddress,
        { from: shortTx.loanOffering.lender }
      );

      const { lender } = await getShort(shortSell, shortTx.id);

      expect(lender.toLowerCase()).to.eq(toAddress.toLowerCase());
    });
  });

  contract('ShortSell', function(accounts) {
    const toAddress = accounts[6];
    it('only allows short seller to transfer', async () => {
      const shortSell = await ShortSell.deployed();
      const shortTx = await doShort(accounts);

      await expectThrow( () => shortSell.transferLoan(
        shortTx.id,
        toAddress,
        { from: toAddress }
      ));

      const { lender } = await getShort(shortSell, shortTx.id);

      expect(lender.toLowerCase()).to.eq(shortTx.loanOffering.lender.toLowerCase());
    });
  });
});
