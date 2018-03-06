/*global artifacts*/

const Exchange = artifacts.require("Exchange");
const Vault = artifacts.require("Vault");
const Trader = artifacts.require("Trader");
const ProxyContract = artifacts.require("Proxy");
const ShortSell = artifacts.require("ShortSell");
const TokenA = artifacts.require("TokenA");
const TokenB = artifacts.require("TokenB");
const FeeToken = artifacts.require("TokenC");
const ZeroExExchange = artifacts.require("ZeroExExchange");
const ZeroExProxy = artifacts.require("ZeroExProxy");
const TokenizedShortCreator = artifacts.require("TokenizedShortCreator");
const ShortImpl = artifacts.require("ShortImpl");
const CloseShortImpl = artifacts.require("CloseShortImpl");
const ForceRecoverLoanImpl = artifacts.require("ForceRecoverLoanImpl");
const DepositImpl = artifacts.require("DepositImpl");
const LoanImpl = artifacts.require("LoanImpl");
const BigNumber = require('bignumber.js');

const ONE_HOUR = new BigNumber(60 * 60);

function isDevNetwork(network) {
  return network === 'development'
          || network === 'test'
          || network === 'develop'
          || network === 'dev';
}

function maybeDeployTestTokens(deployer, network) {
  if (isDevNetwork(network)) {
    return deployer.deploy(TokenA)
      .then(() => deployer.deploy(TokenB))
      .then(() => deployer.deploy(FeeToken));
  }
  return Promise.resolve(true);
}

function maybeDeploy0x(deployer, network) {
  if (isDevNetwork(network)) {
    return deployer.deploy(ZeroExProxy)
      .then(() => deployer.deploy(ZeroExExchange, FeeToken.address, ZeroExProxy.address) )
      .then(() => ZeroExProxy.deployed())
      .then( proxy => proxy.addAuthorizedAddress(ZeroExExchange.address) );
  }
  return Promise.resolve(true);
}

async function deployShortSellContracts(deployer) {
  await Promise.all([
    deployer.deploy(ProxyContract),
    deployer.deploy(ShortImpl),
    deployer.deploy(CloseShortImpl),
    deployer.deploy(ForceRecoverLoanImpl),
    deployer.deploy(LoanImpl),
    deployer.deploy(DepositImpl)
  ]);

  // Link ShortSell function libraries
  await Promise.all([
    ShortSell.link('ShortImpl', ShortImpl.address),
    ShortSell.link('CloseShortImpl', CloseShortImpl.address),
    ShortSell.link('ForceRecoverLoanImpl', ForceRecoverLoanImpl.address),
    ShortSell.link('LoanImpl', LoanImpl.address),
    ShortSell.link('DepositImpl', DepositImpl.address)
  ]);

  await Promise.all([
    deployer.deploy(Exchange, ProxyContract.address),
    deployer.deploy(
      Vault,
      ProxyContract.address,
      ONE_HOUR
    )
  ]);
  await deployer.deploy(
    Trader,
    Exchange.address,
    ZeroExExchange.address,
    Vault.address,
    ProxyContract.address,
    ZeroExProxy.address,
    '0x0000000000000000000000000000010',
    ONE_HOUR
  );

  await deployer.deploy(
    ShortSell,
    Vault.address,
    Trader.address,
    ProxyContract.address
  );

  await deployer.deploy(
    TokenizedShortCreator,
    ShortSell.address
  );
}

async function authorizeOnProxy() {
  const proxy = await ProxyContract.deployed();
  await Promise.all([
    proxy.grantTransferAuthorization(Vault.address),
    proxy.grantTransferAuthorization(Exchange.address),
    proxy.grantTransferAuthorization(ShortSell.address)
  ]);
}

async function grantAccessToVault() {
  const vault = await Vault.deployed();
  return Promise.all([
    vault.grantAccess(ShortSell.address),
    vault.grantAccess(Trader.address)
  ]);
}

async function grantAccessToTrader() {
  const trader = await Trader.deployed();
  return trader.grantAccess(ShortSell.address);
}

async function doMigration(deployer, network) {
  await maybeDeployTestTokens(deployer, network);
  await maybeDeploy0x(deployer, network);
  await deployShortSellContracts(deployer);
  await Promise.all([
    authorizeOnProxy(),
    grantAccessToVault(),
    grantAccessToTrader()
  ]);
}

module.exports = (deployer, network, _addresses) => {
  deployer.then(() => doMigration(deployer, network));
};
