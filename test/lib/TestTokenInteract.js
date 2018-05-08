/*global artifacts, contract, describe, it, beforeEach*/

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());
const BigNumber = require('bignumber.js');

const TestTokenInteract = artifacts.require("TestTokenInteract");
const TestToken = artifacts.require("TestToken");
const ErroringToken = artifacts.require("ErroringToken");
const { expectThrow } = require('../helpers/ExpectHelper');
const { issueAndSetAllowance } = require('../helpers/TokenHelper');

contract('TokenInteract', accounts => {
  const amount = new BigNumber(12);
  let tokenInteract, token, erroringToken;
  const holder1 = accounts[4];
  const recipient = accounts[5];
  const spender = accounts[6];

  beforeEach(async () => {
    [tokenInteract, token, erroringToken] = await Promise.all([
      TestTokenInteract.new(),
      TestToken.new(),
      ErroringToken.new()
    ]);
  });

  describe('#balanceOf', () => {
    it("gets the holder's token balance", async () => {
      await token.issueTo(holder1, amount);

      const balance = await tokenInteract.balanceOf.call(token.address, holder1);

      expect(balance).to.be.bignumber.eq(amount);
    });
  });

  describe('#allowance', () => {
    it("gets the holder's token allowance", async () => {
      await token.approve(spender, amount, { from: holder1 });

      const allowance = await tokenInteract.allowance.call(token.address, holder1, spender);

      expect(allowance).to.be.bignumber.eq(amount);
    });
  });

  describe('#approve', () => {
    it("sets the holder's allowance", async () => {
      await token.issueTo(tokenInteract.address, amount);
      await tokenInteract.approve(token.address, spender, amount);

      const allowance = await tokenInteract.allowance.call(
        token.address,
        tokenInteract.address,
        spender
      );

      expect(allowance).to.be.bignumber.eq(amount);
    });

    it("fails if setting allowance on the token fails", async () => {
      await erroringToken.issueTo(tokenInteract.address, amount);
      await expectThrow(tokenInteract.approve(erroringToken.address, spender, amount));

      const allowance = await tokenInteract.allowance.call(token.address, holder1, spender);

      expect(allowance).to.be.bignumber.eq(0);
    });
  });

  describe('#transfer', () => {
    it("successfully transfers tokens", async () => {
      await token.issueTo(tokenInteract.address, amount);
      await tokenInteract.transfer(token.address, recipient, amount);

      const [tokenInteractBalance, recipientBalance] = await Promise.all([
        tokenInteract.balanceOf.call(token.address, tokenInteract.address),
        tokenInteract.balanceOf.call(token.address, recipient),
      ]);

      expect(tokenInteractBalance).to.be.bignumber.eq(0);
      expect(recipientBalance).to.be.bignumber.eq(amount);
    });

    it("does not transfer tokens if 0 amount", async () => {
      const response = await tokenInteract.transfer(token.address, recipient, 0);

      expect(response.logs.length).to.eq(0);

      const [tokenInteractBalance, recipientBalance] = await Promise.all([
        tokenInteract.balanceOf.call(token.address, tokenInteract.address),
        tokenInteract.balanceOf.call(token.address, recipient),
      ]);

      expect(tokenInteractBalance).to.be.bignumber.eq(0);
      expect(recipientBalance).to.be.bignumber.eq(0);
    });

    it("does not transfer tokens if from == to", async () => {
      await token.issueTo(tokenInteract.address, amount);
      const response = await tokenInteract.transfer(token.address, tokenInteract.address, amount);

      expect(response.logs.length).to.eq(0);

      const [tokenInteractBalance, recipientBalance] = await Promise.all([
        tokenInteract.balanceOf.call(token.address, tokenInteract.address),
        tokenInteract.balanceOf.call(token.address, recipient),
      ]);

      expect(tokenInteractBalance).to.be.bignumber.eq(amount);
      expect(recipientBalance).to.be.bignumber.eq(0);
    });

    it("fails if transfer on the token fails", async () => {
      await erroringToken.issueTo(tokenInteract.address, amount);
      await expectThrow(tokenInteract.transfer(token.address, spender, amount));

      const [tokenInteractBalance, recipientBalance] = await Promise.all([
        tokenInteract.balanceOf.call(erroringToken.address, tokenInteract.address),
        tokenInteract.balanceOf.call(erroringToken.address, recipient),
      ]);

      expect(tokenInteractBalance).to.be.bignumber.eq(amount);
      expect(recipientBalance).to.be.bignumber.eq(0);
    });
  });

  describe('#transferFrom', () => {
    it("successfully transfers tokens", async () => {
      await issueAndSetAllowance(
        token,
        holder1,
        amount,
        tokenInteract.address
      );
      await tokenInteract.transferFrom(token.address, holder1, recipient, amount);

      const [holderBalance, recipientBalance] = await Promise.all([
        tokenInteract.balanceOf.call(token.address, holder1),
        tokenInteract.balanceOf.call(token.address, recipient),
      ]);

      expect(holderBalance).to.be.bignumber.eq(0);
      expect(recipientBalance).to.be.bignumber.eq(amount);
    });

    it("does not transfer tokens if 0 amount", async () => {
      await issueAndSetAllowance(
        token,
        holder1,
        amount,
        tokenInteract.address
      );
      const response = await tokenInteract.transferFrom(token.address, holder1, recipient, 0);

      expect(response.logs.length).to.eq(0);

      const [holderBalance, recipientBalance] = await Promise.all([
        tokenInteract.balanceOf.call(token.address, holder1),
        tokenInteract.balanceOf.call(token.address, recipient),
      ]);

      expect(holderBalance).to.be.bignumber.eq(amount);
      expect(recipientBalance).to.be.bignumber.eq(0);
    });

    it("does not transfer tokens if from == to", async () => {
      await issueAndSetAllowance(
        token,
        holder1,
        amount,
        tokenInteract.address
      );
      const response = await tokenInteract.transferFrom(token.address, holder1, holder1, amount);

      expect(response.logs.length).to.eq(0);

      const [holderBalance, recipientBalance] = await Promise.all([
        tokenInteract.balanceOf.call(token.address, holder1),
        tokenInteract.balanceOf.call(token.address, recipient),
      ]);

      expect(holderBalance).to.be.bignumber.eq(amount);
      expect(recipientBalance).to.be.bignumber.eq(0);
    });

    it("fails if transfer on the token fails", async () => {
      await issueAndSetAllowance(
        erroringToken,
        holder1,
        amount,
        tokenInteract.address
      );
      await expectThrow(
        tokenInteract.transferFrom(erroringToken.address, holder1, recipient, amount)
      );

      const [holderBalance, recipientBalance] = await Promise.all([
        tokenInteract.balanceOf.call(erroringToken.address, holder1),
        tokenInteract.balanceOf.call(erroringToken.address, recipient),
      ]);

      expect(holderBalance).to.be.bignumber.eq(amount);
      expect(recipientBalance).to.be.bignumber.eq(0);
    });
  });
});
