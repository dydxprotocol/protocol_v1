/*global artifacts*/

const ZeroExProxy = artifacts.require("ZeroExProxy");
const ZeroExExchange = artifacts.require("ZeroExExchange");
const ZrxToken = artifacts.require("ZrxToken");
const Vault = artifacts.require("Vault");
const ProxyContract = artifacts.require("Proxy");
const ShortSellRepo = artifacts.require("ShortSellRepo");
const ShortSell = artifacts.require("ShortSell");
const TokenA = artifacts.require("TokenA");
const TokenB = artifacts.require("TokenB");

// TODO find out why async migrations don't work
function maybeDeploy0x(deployer, network) {
  if (network === 'development' || network === 'test') {
    return deployer.deploy(ZeroExProxy)
      .then(() => deployer.deploy(ZrxToken))
      .then(() => {
        const zrxTokenAddress = ZrxToken.address;
        const zeroExProxyAddress = ZeroExProxy.address;
        // TODO figure out why deployer doesn't add arguments to this contract creation
        return deployer.deploy(ZeroExExchange, zrxTokenAddress, zeroExProxyAddress);
      })
      .then(() => ZeroExProxy.deployed())
      .then( proxy => proxy.addAuthorizedAddress(ZeroExExchange.address) )
      .then(() => ZeroExExchange.deployed())
      .then( proxy => proxy.setAddresses(ZrxToken.address, ZeroExProxy.address) );
  } else {
    Promise.resolve(() => true);
    // TODO
  }
}

function maybeDeployTestTokens(deployer, network) {
  if (network === 'development' || network === 'test') {
    return deployer.deploy(TokenA)
      .then(() => deployer.deploy(TokenB));
  }
}

module.exports = (deployer, network, addresses) => {

  maybeDeploy0x(deployer, network)
    .then(() => deployer.deploy(ProxyContract))
    .then(() => deployer.deploy(
      Vault,
      ProxyContract.address,
      ZeroExExchange.address,
      ZeroExProxy.address,
      ZrxToken.address,
    ))
    .then(() => deployer.deploy(ShortSellRepo))
    .then(() => deployer.deploy(
      ShortSell,
      Vault.address,
      ZrxToken.address,
      ShortSellRepo.address
    ))
    .then(() => ProxyContract.deployed())
    .then(proxy => proxy.grantAccess(addresses[0]))
    .then(() => Vault.deployed())
    .then(vault => vault.grantAccess(ShortSell.address))
    .then(() => ShortSellRepo.deployed())
    .then(repo => repo.grantAccess(ShortSell.address))
    .then(() => ProxyContract.deployed())
    .then(proxy => proxy.grantTransferAuthorization(Vault.address))
    .then(() => maybeDeployTestTokens(deployer, network));
};
