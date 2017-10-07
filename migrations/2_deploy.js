/*global artifacts*/

const Exchange = artifacts.require("Exchange");
const Vault = artifacts.require("Vault");
const Trader = artifacts.require("Trader");
const ProxyContract = artifacts.require("Proxy");
const ShortSellRepo = artifacts.require("ShortSellRepo");
const ShortSell = artifacts.require("ShortSell");
const TokenA = artifacts.require("TokenA");
const TokenB = artifacts.require("TokenB");
const FeeToken = artifacts.require("TokenC");
const ZeroExExchange = artifacts.require("ZeroExExchange");
const ZeroExProxy = artifacts.require("ZeroExProxy");

function maybeDeployTestTokens(deployer, network) {
  if (network === 'development' || network === 'test') {
    return deployer.deploy(TokenA)
      .then(() => deployer.deploy(TokenB))
      .then(() => deployer.deploy(FeeToken));
  }
  return Promise.resolve(true);
}

function maybeDeploy0x(deployer, network) {
  if (network === 'development' || network === 'test') {
    return deployer.deploy(ZeroExProxy)
      .then(() => deployer.deploy(ZeroExExchange, FeeToken.address, ZeroExProxy.address));
  }
  return Promise.resolve(true);
}

module.exports = (deployer, network, addresses) => {
  return maybeDeployTestTokens(deployer, network)
    .then(() => maybeDeploy0x(deployer, network))
    .then(() => deployer.deploy(ProxyContract))
    .then(() => deployer.deploy(Exchange, ProxyContract.address))
    .then(() => deployer.deploy(
      Vault,
      ProxyContract.address
    ))
    .then(() => deployer.deploy(
      Trader,
      Exchange.address,
      ZeroExExchange.address,
      Vault.address,
      ProxyContract.address,
      '0x0000000000000000000000000000010'
    ))
    .then(() => deployer.deploy(ShortSellRepo))
    .then(() => deployer.deploy(
      ShortSell,
      Vault.address,
      ShortSellRepo.address,
      Trader.address,
      ProxyContract.address
    ))
    .then(() => ProxyContract.deployed())
    .then(proxy => {
      proxy.grantAccess(addresses[0]);
      return proxy;
    })
    .then(proxy => Promise.all([
        proxy.grantTransferAuthorization(Vault.address),
        proxy.grantTransferAuthorization(Exchange.address),
        proxy.grantTransferAuthorization(Trader.address),
        proxy.grantTransferAuthorization(ShortSell.address),
      ])
    )
    .then(() => Vault.deployed())
    .then(vault => Promise.all([
      vault.grantAccess(ShortSell.address),
      vault.grantAccess(Trader.address)
    ]))
    .then(() => ShortSellRepo.deployed())
    .then(repo => repo.grantAccess(ShortSell.address))
    .then(() => Trader.deployed())
    .then(trader => trader.grantAccess(ShortSell.address));
};
