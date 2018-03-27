/*global artifacts*/

const ZeroExExchangeWrapper = artifacts.require("ZeroExExchangeWrapper");
const Vault = artifacts.require("Vault");
const ProxyContract = artifacts.require("Proxy");
const ShortSell = artifacts.require("ShortSell");
const ZeroExExchange = artifacts.require("ZeroExExchange");
const ZeroExProxy = artifacts.require("ZeroExProxy");
const ERC20ShortCreator = artifacts.require("ERC20ShortCreator");
const ERC721Short = artifacts.require("ERC721Short");
const DutchAuctionCloser = artifacts.require("DutchAuctionCloser");
const ShortImpl = artifacts.require("ShortImpl");
const CloseShortImpl = artifacts.require("CloseShortImpl");
const LiquidateImpl = artifacts.require("LiquidateImpl");
const ForceRecoverLoanImpl = artifacts.require("ForceRecoverLoanImpl");
const DepositImpl = artifacts.require("DepositImpl");
const LoanImpl = artifacts.require("LoanImpl");
const TransferImpl = artifacts.require("TransferImpl");
const TransferInternal = artifacts.require("TransferInternal");
const InterestImpl = artifacts.require("InterestImpl");

// For testing
const TokenA = artifacts.require("TokenA");
const TokenB = artifacts.require("TokenB");
const FeeToken = artifacts.require("TokenC");

// Other constants
const BigNumber = require('bignumber.js');
const ONE_HOUR = new BigNumber(60 * 60);

function isDevNetwork(network) {
  return network === 'development'
          || network === 'test'
          || network === 'develop'
          || network === 'dev'
          || network === 'coverage';
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
  await deployer.deploy(TransferInternal);

  await Promise.all([
    ShortSell.link('TransferInternal', TransferInternal.address),
    TransferImpl.link('TransferInternal', TransferInternal.address)
  ]);

  await Promise.all([
    deployer.deploy(ProxyContract),
    deployer.deploy(CloseShortImpl),
    deployer.deploy(LiquidateImpl),
    deployer.deploy(InterestImpl),
    deployer.deploy(ForceRecoverLoanImpl),
    deployer.deploy(LoanImpl),
    deployer.deploy(DepositImpl),
    deployer.deploy(TransferImpl),
    deployer.deploy(ShortImpl)
  ]);

  // Link ShortSell function libraries
  await Promise.all([
    ShortSell.link('ShortImpl', ShortImpl.address),
    ShortSell.link('CloseShortImpl', CloseShortImpl.address),
    ShortSell.link('LiquidateImpl', LiquidateImpl.address),
    ShortSell.link('InterestImpl', InterestImpl.address),
    ShortSell.link('ForceRecoverLoanImpl', ForceRecoverLoanImpl.address),
    ShortSell.link('LoanImpl', LoanImpl.address),
    ShortSell.link('DepositImpl', DepositImpl.address),
    ShortSell.link('TransferImpl', TransferImpl.address)
  ]);

  await deployer.deploy(
    Vault,
    ProxyContract.address,
    ONE_HOUR
  );

  await deployer.deploy(
    ShortSell,
    Vault.address,
    ProxyContract.address
  );

  await Promise.all([
    deployer.deploy(
      ZeroExExchangeWrapper,
      ShortSell.address,
      ProxyContract.address,
      ZeroExExchange.address, // TODO update these for prod
      ZeroExProxy.address,
      FeeToken.address
    ),
    deployer.deploy(
      ERC721Short,
      ShortSell.address
    ),
    deployer.deploy(
      DutchAuctionCloser,
      ShortSell.address,
      new BigNumber(1), // Numerator
      new BigNumber(2), // Denominator
    )
  ]);

  await deployer.deploy(
    ERC20ShortCreator,
    ShortSell.address,
    [DutchAuctionCloser.address]
  );
}

async function authorizeOnProxy() {
  const proxy = await ProxyContract.deployed();
  await Promise.all([
    proxy.grantTransferAuthorization(Vault.address),
    proxy.grantTransferAuthorization(ShortSell.address)
  ]);
}

async function grantAccessToVault() {
  const vault = await Vault.deployed();
  return vault.grantAccess(ShortSell.address);
}

async function doMigration(deployer, network) {
  await maybeDeployTestTokens(deployer, network);
  await maybeDeploy0x(deployer, network);
  await deployShortSellContracts(deployer);
  await Promise.all([
    authorizeOnProxy(),
    grantAccessToVault()
  ]);
}

module.exports = (deployer, network, _addresses) => {
  deployer.then(() => doMigration(deployer, network));
};
