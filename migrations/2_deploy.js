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
    return Promise.resolve(true);
    // TODO
  }
}

function maybeDeployTestTokens(deployer, network) {
  if (network === 'development' || network === 'test') {
    return deployer.deploy(TokenA)
      .then(() => deployer.deploy(TokenB));
  }
  return Promise.resolve(true);
}

function getAddresses(network) {
  if (network === 'development' || network === 'test') {
    return {
      zeroExExchange: ZeroExExchange.address,
      zeroExProxy: ZeroExProxy.address,
      zrxToken: ZrxToken.address
    };
  } else {
    return {
      zeroExExchange: '0x63869171a246622ef8f9234879ce2c06cebd85f6',
      zeroExProxy: '0x946a1c437fb5a61bd5c95416346e684c802c5d2a',
      zrxToken: '0xae92f9459a93623241329acd6f9dc2f4d970d450'
    }
  }
}

module.exports = (deployer, network, addresses) => {

  maybeDeploy0x(deployer, network)
    .then(() => deployer.deploy(ProxyContract))
    .then(() => deployer.deploy(
      Vault,
      ProxyContract.address,
      getAddresses(network).zeroExExchange,
      getAddresses(network).zeroExProxy,
      getAddresses(network).zrxToken,
    ))
    .then(() => deployer.deploy(ShortSellRepo))
    .then(() => deployer.deploy(
      ShortSell,
      Vault.address,
      getAddresses(network).zrxToken,
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
