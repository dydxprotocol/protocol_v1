/*global artifacts, web3*/

const Token = artifacts.require("TokenA");

async function issue(address, amount) {
  const token = await Token.deployed();

  await token.issueTo(address, amount);
}

async function approve(from, who, amount) {
  const token = await Token.deployed();

  await token.approve(who, amount, { from });
}

module.exports = {
  issue,
  approve
};
