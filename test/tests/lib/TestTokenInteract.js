const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());
const BigNumber = require('bignumber.js');

const TestTokenInteract = artifacts.require("TestTokenInteract");
const TestToken = artifacts.require("TestToken");
const ErroringToken = artifacts.require("ErroringToken");
const OmiseToken = artifacts.require("OmiseToken");
const ErroringOmiseToken = artifacts.require("ErroringOmiseToken");
const { expectThrow } = require('../../helpers/ExpectHelper');
const { issueAndSetAllowance } = require('../../helpers/TokenHelper');

contract('TokenInteract', accounts => {
  const amount = new BigNumber(12);
  let TokenInteract;
  const holder1 = accounts[4];
  const recipient = accounts[5];
  const spender = accounts[6];

  before(async () => {
    TokenInteract = await TestTokenInteract.new();
  });

  describe('#balanceOf', () => {
    it("gets the holder's token balance", async () => {
      const token = await TestToken.new();

      await token.issueTo(holder1, amount);

      const balance = await TokenInteract.balanceOf.call(token.address, holder1);

      expect(balance).to.be.bignumber.eq(amount);
    });
  });

  describe('#allowance', () => {
    it("gets the holder's token allowance", async () => {
      const token = await TestToken.new();

      await token.approve(spender, amount, { from: holder1 });

      const allowance = await TokenInteract.allowance.call(token.address, holder1, spender);

      expect(allowance).to.be.bignumber.eq(amount);
    });
  });

  describe('#approve', () => {
    it("sets the holder's allowance", async () => {
      const token = await TestToken.new();

      await token.issueTo(TokenInteract.address, amount);
      await TokenInteract.approve(token.address, spender, amount);

      const allowance = await TokenInteract.allowance.call(
        token.address,
        TokenInteract.address,
        spender
      );

      expect(allowance).to.be.bignumber.eq(amount);
    });

    it("sets the holder's allowance (omg)", async () => {
      const token = await OmiseToken.new();

      await token.issueTo(TokenInteract.address, amount);
      await TokenInteract.approve(token.address, spender, amount);

      const allowance = await TokenInteract.allowance.call(
        token.address,
        TokenInteract.address,
        spender
      );

      expect(allowance).to.be.bignumber.eq(amount);
    });

    it("fails if setting allowance on the token fails", async () => {
      const token = await ErroringToken.new();

      await token.issueTo(TokenInteract.address, amount);
      await expectThrow(TokenInteract.approve(token.address, spender, amount));

      const allowance = await TokenInteract.allowance.call(token.address, holder1, spender);

      expect(allowance).to.be.bignumber.eq(0);
    });

    it("fails if setting allowance on the token fails (omg)", async () => {
      const token = await ErroringOmiseToken.new();

      await token.issueTo(TokenInteract.address, amount);
      await expectThrow(TokenInteract.approve(token.address, spender, amount));

      const allowance = await TokenInteract.allowance.call(token.address, holder1, spender);

      expect(allowance).to.be.bignumber.eq(0);
    });
  });

  describe('#transfer', () => {
    it("successfully transfers tokens", async () => {
      const token = await TestToken.new();

      await token.issueTo(TokenInteract.address, amount);
      await TokenInteract.transfer(token.address, recipient, amount);

      const [TokenInteractBalance, recipientBalance] = await Promise.all([
        TokenInteract.balanceOf.call(token.address, TokenInteract.address),
        TokenInteract.balanceOf.call(token.address, recipient),
      ]);

      expect(TokenInteractBalance).to.be.bignumber.eq(0);
      expect(recipientBalance).to.be.bignumber.eq(amount);
    });

    it("successfully transfers tokens (omg)", async () => {
      const token = await OmiseToken.new();

      await token.issueTo(TokenInteract.address, amount);
      await TokenInteract.transfer(token.address, recipient, amount);

      const [TokenInteractBalance, recipientBalance] = await Promise.all([
        TokenInteract.balanceOf.call(token.address, TokenInteract.address),
        TokenInteract.balanceOf.call(token.address, recipient),
      ]);

      expect(TokenInteractBalance).to.be.bignumber.eq(0);
      expect(recipientBalance).to.be.bignumber.eq(amount);
    });

    it("does not transfer tokens if 0 amount", async () => {
      const token = await TestToken.new();

      const response = await TokenInteract.transfer(token.address, recipient, 0);

      expect(response.logs.length).to.eq(0);

      const [TokenInteractBalance, recipientBalance] = await Promise.all([
        TokenInteract.balanceOf.call(token.address, TokenInteract.address),
        TokenInteract.balanceOf.call(token.address, recipient),
      ]);

      expect(TokenInteractBalance).to.be.bignumber.eq(0);
      expect(recipientBalance).to.be.bignumber.eq(0);
    });

    it("does not transfer tokens if from == to", async () => {
      const token = await TestToken.new();

      await token.issueTo(TokenInteract.address, amount);
      const response = await TokenInteract.transfer(token.address, TokenInteract.address, amount);

      expect(response.logs.length).to.eq(0);

      const [TokenInteractBalance, recipientBalance] = await Promise.all([
        TokenInteract.balanceOf.call(token.address, TokenInteract.address),
        TokenInteract.balanceOf.call(token.address, recipient),
      ]);

      expect(TokenInteractBalance).to.be.bignumber.eq(amount);
      expect(recipientBalance).to.be.bignumber.eq(0);
    });

    it("fails if transfer on the token fails", async () => {
      const token = await ErroringToken.new();

      await token.issueTo(TokenInteract.address, amount);
      await expectThrow(TokenInteract.transfer(token.address, spender, amount));

      const [TokenInteractBalance, recipientBalance] = await Promise.all([
        TokenInteract.balanceOf.call(token.address, TokenInteract.address),
        TokenInteract.balanceOf.call(token.address, recipient),
      ]);

      expect(TokenInteractBalance).to.be.bignumber.eq(amount);
      expect(recipientBalance).to.be.bignumber.eq(0);
    });

    it("fails if transfer on the token fails (omg)", async () => {
      const token = await ErroringOmiseToken.new();

      await token.issueTo(TokenInteract.address, amount);
      await expectThrow(TokenInteract.transfer(token.address, spender, amount));

      const [TokenInteractBalance, recipientBalance] = await Promise.all([
        TokenInteract.balanceOf.call(token.address, TokenInteract.address),
        TokenInteract.balanceOf.call(token.address, recipient),
      ]);

      expect(TokenInteractBalance).to.be.bignumber.eq(amount);
      expect(recipientBalance).to.be.bignumber.eq(0);
    });
  });

  describe('#transferFrom', () => {
    it("successfully transfers tokens", async () => {
      const token = await TestToken.new();

      await issueAndSetAllowance(
        token,
        holder1,
        amount,
        TokenInteract.address
      );
      await TokenInteract.transferFrom(token.address, holder1, recipient, amount);

      const [holderBalance, recipientBalance] = await Promise.all([
        TokenInteract.balanceOf.call(token.address, holder1),
        TokenInteract.balanceOf.call(token.address, recipient),
      ]);

      expect(holderBalance).to.be.bignumber.eq(0);
      expect(recipientBalance).to.be.bignumber.eq(amount);
    });

    it("successfully transfers tokens (omg)", async () => {
      const token = await OmiseToken.new();

      await issueAndSetAllowance(
        token,
        holder1,
        amount,
        TokenInteract.address
      );
      await TokenInteract.transferFrom(token.address, holder1, recipient, amount);

      const [holderBalance, recipientBalance] = await Promise.all([
        TokenInteract.balanceOf.call(token.address, holder1),
        TokenInteract.balanceOf.call(token.address, recipient),
      ]);

      expect(holderBalance).to.be.bignumber.eq(0);
      expect(recipientBalance).to.be.bignumber.eq(amount);
    });

    it("does not transfer tokens if 0 amount", async () => {
      const token = await TestToken.new();

      await issueAndSetAllowance(
        token,
        holder1,
        amount,
        TokenInteract.address
      );
      const response = await TokenInteract.transferFrom(token.address, holder1, recipient, 0);

      expect(response.logs.length).to.eq(0);

      const [holderBalance, recipientBalance] = await Promise.all([
        TokenInteract.balanceOf.call(token.address, holder1),
        TokenInteract.balanceOf.call(token.address, recipient),
      ]);

      expect(holderBalance).to.be.bignumber.eq(amount);
      expect(recipientBalance).to.be.bignumber.eq(0);
    });

    it("does not transfer tokens if from == to", async () => {
      const token = await TestToken.new();

      await issueAndSetAllowance(
        token,
        holder1,
        amount,
        TokenInteract.address
      );
      const response = await TokenInteract.transferFrom(token.address, holder1, holder1, amount);

      expect(response.logs.length).to.eq(0);

      const [holderBalance, recipientBalance] = await Promise.all([
        TokenInteract.balanceOf.call(token.address, holder1),
        TokenInteract.balanceOf.call(token.address, recipient),
      ]);

      expect(holderBalance).to.be.bignumber.eq(amount);
      expect(recipientBalance).to.be.bignumber.eq(0);
    });

    it("fails if transferFrom on the token fails", async () => {
      const token = await ErroringToken.new();

      await token.issueTo(holder1, amount);

      await expectThrow(
        TokenInteract.transferFrom(token.address, holder1, recipient, amount)
      );

      const [holderBalance, recipientBalance] = await Promise.all([
        TokenInteract.balanceOf.call(token.address, holder1),
        TokenInteract.balanceOf.call(token.address, recipient),
      ]);

      expect(holderBalance).to.be.bignumber.eq(amount);
      expect(recipientBalance).to.be.bignumber.eq(0);
    });

    it("fails if transferFrom on the token fails (omg)", async () => {
      const token = await ErroringOmiseToken.new();

      await token.issueTo(holder1, amount);

      await expectThrow(
        TokenInteract.transferFrom(token.address, holder1, recipient, amount)
      );

      const [holderBalance, recipientBalance] = await Promise.all([
        TokenInteract.balanceOf.call(token.address, holder1),
        TokenInteract.balanceOf.call(token.address, recipient),
      ]);

      expect(holderBalance).to.be.bignumber.eq(amount);
      expect(recipientBalance).to.be.bignumber.eq(0);
    });
  });
});
