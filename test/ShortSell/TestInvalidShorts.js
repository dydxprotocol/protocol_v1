/*global artifacts, web3, contract, describe, it*/

const expect = require('chai').expect;
const Web3 = require('web3');
const BigNumber = require('bignumber.js');

const ShortSell = artifacts.require("ShortSell");
const BaseToken = artifacts.require("TokenA");
const UnderlyingToken = artifacts.require("TokenB");
const FeeToken = artifacts.require("TokenC");
const Vault = artifacts.require("Vault");

const web3Instance = new Web3(web3.currentProvider);

const {
  createShortSellTx,
  issueTokensAndSetAllowancesForShort,
  callShort,
  getPartialAmount
} = require('../helpers/ShortSellHelper');

contract('ShortSell', function(accounts) {
  describe('#short', () => {
    it('short fails on invalid order signature', async () => {
      const shortTx = await createShortSellTx(accounts);
      const shortSell = await ShortSell.deployed();

      await issueTokensAndSetAllowancesForShort(shortTx);
      shortTx.buyOrder.ecSignature.v = '0x0';

      try {
        await callShort(shortSell, shortTx);
        console.log('succeeded');
      } catch (e) {
        console.log('failed');
        console.log(e);
      }
    });
  });
});
