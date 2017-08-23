/*global artifacts*/

const Exchange = artifacts.require("Exchange");
const Vault = artifacts.require("Vault");
const ProxyContract = artifacts.require("Proxy");
const ShortSellRepo = artifacts.require("ShortSellRepo");
const ShortSell = artifacts.require("ShortSell");
const TokenA = artifacts.require("TokenA");
const TokenB = artifacts.require("TokenB");

function maybeDeployTestTokens(deployer, network) {
  if (network === 'development' || network === 'test') {
    return deployer.deploy(TokenA)
      .then(() => deployer.deploy(TokenB));
  }
  return Promise.resolve(true);
}


module.exports = (deployer, network, addresses) => {
  return deployer.deploy(ProxyContract)
    .then(() => deployer.deploy(Exchange, ProxyContract.address))
    .then(() => deployer.deploy(
      Vault,
      ProxyContract.address,
      Exchange.address
    ))
    .then(() => deployer.deploy(ShortSellRepo))
    .then(() => deployer.deploy(
      ShortSell,
      Vault.address,
      ShortSellRepo.address
    ))
    .then(() => ProxyContract.deployed())
    .then(proxy => {
      proxy.grantAccess(addresses[0]);
      return proxy;
    })
    .then(proxy => {
      proxy.grantTransferAuthorization(Vault.address)
      return proxy;
    })
    .then(proxy => {
      proxy.grantTransferAuthorization(Exchange.address)
    })
    .then(() => Vault.deployed())
    .then(vault => vault.grantAccess(ShortSell.address))
    .then(() => ShortSellRepo.deployed())
    .then(repo => repo.grantAccess(ShortSell.address))
    .then(() => maybeDeployTestTokens(deployer, network));
};
