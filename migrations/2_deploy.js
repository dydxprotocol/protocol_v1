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
// module.exports = async (deployer, network, addresses) => {
//     let zrxTokenAddress;
//     let zeroExProxyAddress;
//     let zeroExExchangeAddress;
//     if (network === 'development' || network === 'test') {
//         console.log('Deploying 0x for Dev');
//         await deployer.deploy(ZeroExProxy);
//         await deployer.deploy(ZrxToken);
//         zrxTokenAddress = ZrxToken.address;
//         zeroExProxyAddress = ZeroExProxy.address;
//         await deployer.deploy(ZeroExExchange, zrxTokenAddress, zeroExProxyAddress);
//         console.log('Finished deploying 0x');
//     } else {
//         // TODO
//     }
//
//     await deployer.deploy(ProxyContract);
//     await deployer.deploy(
//         Vault,
//         ProxyContract.address,
//         zeroExExchangeAddress,
//         zeroExProxyAddress,
//         zrxTokenAddress
//     );
//     await deployer.deploy(ShortSellRepo);
//     await deployer.deploy(ShortSell, Vault.address, zrxTokenAddress, ShortSellRepo.address);
//
//     const proxy = await ProxyContract.deployed();
//     const vault = await Vault.deployed();
//     const repo = await ShortSellRepo.deployed();
//     await ShortSell.deployed();
//
//     await Promise.all([
//         vault.grantAccess(ShortSell.address),
//         repo.grantAccess(ShortSell.address),
//         proxy.grantAccess(addresses[0])
//     ]);
//
//     await proxy.grantTransferAuthorization(ShortSell.address);
// };

function maybeDeploy0x(deployer, network) {
    if (network === 'development' || network === 'test') {
        return deployer.deploy(ZeroExProxy)
            .then(() => deployer.deploy(ZrxToken))
            .then(() => {
                zrxTokenAddress = ZrxToken.address;
                zeroExProxyAddress = ZeroExProxy.address;
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
