/*global artifacts*/

const Exchange = artifacts.require("Exchange");
const Vault = artifacts.require("Vault");
const Trader = artifacts.require("Trader");
const ProxyContract = artifacts.require("Proxy");
const ShortSellRepo = artifacts.require("ShortSellRepo");
const ShortSellAuctionRepo = artifacts.require("ShortSellAuctionRepo");
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
const LoanImpl = artifacts.require("LoanImpl");
const PlaceSellbackBidImpl = artifacts.require("PlaceSellbackBidImpl");
const LinearTermsContract = artifacts.require("LinearTermsContract");
const BigNumber = require('bignumber.js');

const ONE_HOUR = new BigNumber(60 * 60);
const ONE_DAY = new BigNumber(60 * 60 * 24);

function isDevNetwork(network) {
  return network === 'development' || network === 'test' || network === 'develop';
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
    deployer.deploy(ProxyContract, ONE_DAY, ONE_HOUR),
    deployer.deploy(
      ShortSellRepo,
      ONE_DAY,
      ONE_HOUR,
    ),
    deployer.deploy(
      ShortSellAuctionRepo,
      ONE_DAY,
      ONE_HOUR,
    ),
    deployer.deploy(ShortImpl),
    deployer.deploy(CloseShortImpl),
    deployer.deploy(ForceRecoverLoanImpl),
    deployer.deploy(LoanImpl),
    deployer.deploy(PlaceSellbackBidImpl),
    deployer.deploy(LinearTermsContract)
  ]);

  // Link ShortSell function libraries
  await Promise.all([
    ShortSell.link('ShortImpl', ShortImpl.address),
    ShortSell.link('CloseShortImpl', CloseShortImpl.address),
    ShortSell.link('ForceRecoverLoanImpl', ForceRecoverLoanImpl.address),
    ShortSell.link('LoanImpl', LoanImpl.address),
    ShortSell.link('PlaceSellbackBidImpl', PlaceSellbackBidImpl.address)
  ]);

  await Promise.all([
    deployer.deploy(Exchange, ProxyContract.address),
    deployer.deploy(
      Vault,
      ProxyContract.address,
      ONE_DAY,
      ONE_HOUR,
      ONE_DAY,
      ONE_DAY
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
    ONE_DAY,
    ONE_HOUR,
    ONE_DAY,
    ONE_DAY
  );

  await deployer.deploy(
    ShortSell,
    Vault.address,
    ShortSellRepo.address,
    ShortSellAuctionRepo.address,
    Trader.address,
    ProxyContract.address,
    ONE_DAY,
    ONE_DAY
  );

  await deployer.deploy(
    TokenizedShortCreator,
    ShortSell.address,
    ONE_DAY,
    ONE_DAY
  );
}

async function authorizeOnProxy() {
  const proxy = await ProxyContract.deployed();
  await Promise.all([
    proxy.ownerGrantTransferAuthorization(Vault.address),
    proxy.ownerGrantTransferAuthorization(Exchange.address),
    proxy.ownerGrantTransferAuthorization(Trader.address),
    proxy.ownerGrantTransferAuthorization(ShortSell.address),
    proxy.grantAccess(TokenizedShortCreator.address)
  ]);
}

async function grantAccessToVault() {
  const vault = await Vault.deployed();
  return Promise.all([
    vault.grantAccess(ShortSell.address),
    vault.grantAccess(Trader.address)
  ]);
}

async function grantAccessToRepo() {
  const repo = await ShortSellRepo.deployed();
  return repo.grantAccess(ShortSell.address);
}

async function grantAccessToAuctionRepo() {
  const auctionRepo = await ShortSellAuctionRepo.deployed();
  return auctionRepo.grantAccess(ShortSell.address);
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
    grantAccessToRepo(),
    grantAccessToAuctionRepo(),
    grantAccessToTrader()
  ]);
}

module.exports = (deployer, network, _addresses) => {
  deployer.then(() => doMigration(deployer, network));
};
