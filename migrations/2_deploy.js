/*

    Copyright 2018 dYdX Trading Inc.

    Licensed under the Apache License, Version 2.0 (the "License");
    you may not use this file except in compliance with the License.
    You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

    Unless required by applicable law or agreed to in writing, software
    distributed under the License is distributed on an "AS IS" BASIS,
    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
    See the License for the specific language governing permissions and
    limitations under the License.

*/

/*global artifacts*/

const ZeroExExchangeWrapper = artifacts.require("ZeroExExchangeWrapper");
const Vault = artifacts.require("Vault");
const ProxyContract = artifacts.require("Proxy");
const Margin = artifacts.require("Margin");
const ZeroExExchange = artifacts.require("ZeroExExchange");
const ZeroExProxy = artifacts.require("ZeroExProxy");
const SharedLoanCreator = artifacts.require("SharedLoanCreator");
const ERC20LongCreator = artifacts.require("ERC20LongCreator");
const ERC20ShortCreator = artifacts.require("ERC20ShortCreator");
const ERC721MarginPosition = artifacts.require("ERC721MarginPosition");
const DutchAuctionCloser = artifacts.require("DutchAuctionCloser");
const OpenPositionImpl = artifacts.require("OpenPositionImpl");
const IncreasePositionImpl = artifacts.require("IncreasePositionImpl");
const ClosePositionImpl = artifacts.require("ClosePositionImpl");
const CloseWithoutCounterpartyImpl = artifacts.require("CloseWithoutCounterpartyImpl");
const ForceRecoverCollateralImpl = artifacts.require("ForceRecoverCollateralImpl");
const DepositCollateralImpl = artifacts.require("DepositCollateralImpl");
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
      .then(() => deployer.deploy(ZeroExExchange, FeeToken.address, ZeroExProxy.address))
      .then(() => ZeroExProxy.deployed())
      .then(proxy => proxy.addAuthorizedAddress(ZeroExExchange.address));
  }
  return Promise.resolve(true);
}

async function deployMarginContracts(deployer) {
  await Promise.all([
    deployer.deploy(ProxyContract, ONE_HOUR),
    deployer.deploy(InterestImpl),
    deployer.deploy(ForceRecoverCollateralImpl),
    deployer.deploy(LoanImpl),
    deployer.deploy(DepositCollateralImpl),
    deployer.deploy(TransferImpl),
    deployer.deploy(OpenPositionImpl),
  ]);

  await Promise.all([
    ClosePositionImpl.link('InterestImpl', InterestImpl.address),
    CloseWithoutCounterpartyImpl.link('InterestImpl', InterestImpl.address),
    IncreasePositionImpl.link('InterestImpl', InterestImpl.address),
  ]);

  await Promise.all([
    deployer.deploy(ClosePositionImpl),
    deployer.deploy(CloseWithoutCounterpartyImpl),
    deployer.deploy(IncreasePositionImpl),
  ]);

  // Link Margin function libraries
  await Promise.all([
    Margin.link('OpenPositionImpl', OpenPositionImpl.address),
    Margin.link('ClosePositionImpl', ClosePositionImpl.address),
    Margin.link('CloseWithoutCounterpartyImpl', CloseWithoutCounterpartyImpl.address),
    Margin.link('InterestImpl', InterestImpl.address),
    Margin.link('ForceRecoverCollateralImpl', ForceRecoverCollateralImpl.address),
    Margin.link('LoanImpl', LoanImpl.address),
    Margin.link('DepositCollateralImpl', DepositCollateralImpl.address),
    Margin.link('TransferImpl', TransferImpl.address),
    Margin.link('IncreasePositionImpl', IncreasePositionImpl.address)
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
      ERC721MarginPosition,
      Margin.address
    ),
    deployer.deploy(
      DutchAuctionCloser,
      Margin.address,
      new BigNumber(1), // Numerator
      new BigNumber(2), // Denominator
    )
  ]);

  await Promise.all([
    deployer.deploy(
      ERC20ShortCreator,
      Margin.address,
      [DutchAuctionCloser.address]
    ),
    deployer.deploy(
      ERC20LongCreator,
      Margin.address,
      [DutchAuctionCloser.address]
    )
  ]);

  await deployer.deploy(
    SharedLoanCreator,
    Margin.address,
    [/* Trusted Margin Callers */] //TODO: add dYdX multisig address
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
