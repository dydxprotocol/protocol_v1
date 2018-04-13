/*global artifacts*/

const ZeroExExchangeWrapper = artifacts.require("ZeroExExchangeWrapper");
const Vault = artifacts.require("Vault");
const ProxyContract = artifacts.require("Proxy");
const Margin = artifacts.require("Margin");
const ZeroExExchange = artifacts.require("ZeroExExchange");
const ZeroExProxy = artifacts.require("ZeroExProxy");
const ERC20ShortCreator = artifacts.require("ERC20ShortCreator");
const ERC721Short = artifacts.require("ERC721Short");
const DutchAuctionCloser = artifacts.require("DutchAuctionCloser");
const ShortImpl = artifacts.require("ShortImpl");
const AddValueToShortImpl = artifacts.require("AddValueToShortImpl");
const CloseShortImpl = artifacts.require("CloseShortImpl");
const LiquidateImpl = artifacts.require("LiquidateImpl");
const ForceRecoverLoanImpl = artifacts.require("ForceRecoverLoanImpl");
const DepositImpl = artifacts.require("DepositImpl");
const LoanImpl = artifacts.require("LoanImpl");
const TransferImpl = artifacts.require("TransferImpl");
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
      .then(proxy => proxy.addAuthorizedAddress(ZeroExExchange.address));
  }
  return Promise.resolve(true);
}

async function deployMarginContracts(deployer) {
  await Promise.all([
    deployer.deploy(ProxyContract, ONE_HOUR),
    deployer.deploy(InterestImpl),
    deployer.deploy(ForceRecoverLoanImpl),
    deployer.deploy(LoanImpl),
    deployer.deploy(DepositImpl),
    deployer.deploy(TransferImpl),
    deployer.deploy(ShortImpl),
  ]);

  await Promise.all([
    CloseShortImpl.link('InterestImpl', InterestImpl.address),
    LiquidateImpl.link('InterestImpl', InterestImpl.address),
    AddValueToShortImpl.link('InterestImpl', InterestImpl.address),
  ]);

  await Promise.all([
    deployer.deploy(CloseShortImpl),
    deployer.deploy(LiquidateImpl),
    deployer.deploy(AddValueToShortImpl),
  ]);

  // Link Margin function libraries
  await Promise.all([
    Margin.link('ShortImpl', ShortImpl.address),
    Margin.link('CloseShortImpl', CloseShortImpl.address),
    Margin.link('LiquidateImpl', LiquidateImpl.address),
    Margin.link('InterestImpl', InterestImpl.address),
    Margin.link('ForceRecoverLoanImpl', ForceRecoverLoanImpl.address),
    Margin.link('LoanImpl', LoanImpl.address),
    Margin.link('DepositImpl', DepositImpl.address),
    Margin.link('TransferImpl', TransferImpl.address),
    Margin.link('AddValueToShortImpl', AddValueToShortImpl.address)
  ]);

  await deployer.deploy(
    Vault,
    ProxyContract.address,
    ONE_HOUR
  );

  await deployer.deploy(
    Margin,
    Vault.address,
    ProxyContract.address
  );

  await Promise.all([
    deployer.deploy(
      ZeroExExchangeWrapper,
      Margin.address,
      ProxyContract.address,
      ZeroExExchange.address, // TODO update these for prod
      ZeroExProxy.address,
      FeeToken.address
    ),
    deployer.deploy(
      ERC721Short,
      Margin.address
    ),
    deployer.deploy(
      DutchAuctionCloser,
      Margin.address,
      new BigNumber(1), // Numerator
      new BigNumber(2), // Denominator
    )
  ]);

  await deployer.deploy(
    ERC20ShortCreator,
    Margin.address,
    [DutchAuctionCloser.address]
  );
}

async function authorizeOnProxy() {
  const proxy = await ProxyContract.deployed();
  await Promise.all([
    proxy.grantAccess(Vault.address),
    proxy.grantAccess(Margin.address)
  ]);
}

async function grantAccessToVault() {
  const vault = await Vault.deployed();
  return vault.grantAccess(Margin.address);
}

async function doMigration(deployer, network) {
  await maybeDeployTestTokens(deployer, network);
  await maybeDeploy0x(deployer, network);
  await deployMarginContracts(deployer);
  await Promise.all([
    authorizeOnProxy(),
    grantAccessToVault()
  ]);
}

module.exports = (deployer, network, _addresses) => {
  deployer.then(() => doMigration(deployer, network));
};
