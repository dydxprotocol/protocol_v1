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

const { isDevNetwork } = require('./helpers');

const OpenDirectlyExchangeWrapper = artifacts.require("OpenDirectlyExchangeWrapper");
const ZeroExV1ExchangeWrapper = artifacts.require("ZeroExV1ExchangeWrapper");
const Vault = artifacts.require("Vault");
const TokenProxy = artifacts.require("TokenProxy");
const Margin = artifacts.require("Margin");
const ZeroExExchange = artifacts.require("ZeroExExchange");
const ZeroExProxy = artifacts.require("ZeroExProxy");
const SharedLoanFactory = artifacts.require("SharedLoanFactory");
const ERC20PositionWithdrawer = artifacts.require("ERC20PositionWithdrawer");
const ERC20LongFactory = artifacts.require("ERC20LongFactory");
const ERC20ShortFactory = artifacts.require("ERC20ShortFactory");
const ERC721MarginPosition = artifacts.require("ERC721MarginPosition");
const DutchAuctionCloser = artifacts.require("DutchAuctionCloser");
const WethPayoutRecipient = artifacts.require("WethPayoutRecipient");
const OpenPositionImpl = artifacts.require("OpenPositionImpl");
const OpenWithoutCounterpartyImpl = artifacts.require(
  "OpenWithoutCounterpartyImpl"
);
const IncreasePositionImpl = artifacts.require("IncreasePositionImpl");
const ClosePositionImpl = artifacts.require("ClosePositionImpl");
const CloseWithoutCounterpartyImpl = artifacts.require("CloseWithoutCounterpartyImpl");
const ForceRecoverCollateralImpl = artifacts.require("ForceRecoverCollateralImpl");
const DepositCollateralImpl = artifacts.require("DepositCollateralImpl");
const LoanImpl = artifacts.require("LoanImpl");
const TransferImpl = artifacts.require("TransferImpl");
const InterestImpl = artifacts.require("InterestImpl");
const PayableMarginMinter = artifacts.require("PayableMarginMinter");
const BucketLenderFactory = artifacts.require("BucketLenderFactory");
const EthWrapperForBucketLender = artifacts.require("EthWrapperForBucketLender");
const WETH9 = artifacts.require("WETH9");

// For testing
const TokenA = artifacts.require("TokenA");
const TokenB = artifacts.require("TokenB");
const FeeToken = artifacts.require("TokenC");

// Other constants
const BigNumber = require('bignumber.js');
const ONE_HOUR = new BigNumber(60 * 60);

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

function get0xExchangeAddress(network) {
  if (isDevNetwork(network)) {
    return ZeroExExchange.address;
  } else if (network === 'kovan') {
    return '0x90fe2af704b34e0224bf2299c838e04d4dcf1364';
  }

  throw "0x Exchange Not Found";
}

function get0xProxyAddress(network) {
  if (isDevNetwork(network)) {
    return ZeroExProxy.address;
  } else if (network === 'kovan') {
    return '0x087eed4bc1ee3de49befbd66c662b434b15d49d4';
  }

  throw "0x TokenProxy Not Found";
}

function getZRXAddress(network) {
  if (isDevNetwork(network)) {
    return FeeToken.address;
  } else if (network === 'kovan') {
    return '0x6Ff6C0Ff1d68b964901F986d4C9FA3ac68346570';
  }

  throw "ZRX Not Found";
}

function getSharedLoanTrustedMarginCallers(network) {
  if (isDevNetwork(network)) {
    return [];
  } else if (network === 'kovan') {
    return ['0x008E81A8817e0f1820cE98c92C8c72be27443857'];
  }

  throw "Network Unsupported";
}

function getWethAddress(network) {
  if (isDevNetwork(network)) {
    return WETH9.address;
  } else if (network === 'kovan') {
    return '0xd0a1e359811322d97991e03f863a0c30c2cf029c';
  }
}

async function deployContracts(deployer, network) {
  await deployBaseProtocol(deployer);

  await deploySecondLayer(deployer, network);
}

async function deployBaseProtocol(deployer) {
  await Promise.all([
    deployer.deploy(TokenProxy, ONE_HOUR),
    deployer.deploy(InterestImpl),
    deployer.deploy(ForceRecoverCollateralImpl),
    deployer.deploy(LoanImpl),
    deployer.deploy(DepositCollateralImpl),
    deployer.deploy(TransferImpl),
    deployer.deploy(OpenPositionImpl),
    deployer.deploy(OpenWithoutCounterpartyImpl),
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
    Margin.link('IncreasePositionImpl', IncreasePositionImpl.address),
    Margin.link('OpenWithoutCounterpartyImpl', OpenWithoutCounterpartyImpl.address),
  ]);

  await deployer.deploy(
    Vault,
    TokenProxy.address,
    ONE_HOUR
  );

  await deployer.deploy(
    Margin,
    Vault.address,
    TokenProxy.address
  );
}

async function deploySecondLayer(deployer, network) {
  if (isDevNetwork(network)) {
    await deployer.deploy(WETH9);
  }

  await Promise.all([
    deployer.deploy(
      ZeroExV1ExchangeWrapper,
      get0xExchangeAddress(network),
      get0xProxyAddress(network),
      getZRXAddress(network),
      [Margin.address]
    ),
    deployer.deploy(
      OpenDirectlyExchangeWrapper
    ),
    deployer.deploy(
      ERC20PositionWithdrawer,
      getWethAddress(network)
    ),
    deployer.deploy(
      ERC721MarginPosition,
      Margin.address
    ),
    deployer.deploy(
      DutchAuctionCloser,
      Margin.address,
      new BigNumber(1), // Numerator
      new BigNumber(1), // Denominator
    ),
  ]);

  await Promise.all([
    deployer.deploy(
      ERC20ShortFactory,
      Margin.address,
      [DutchAuctionCloser.address],
      [ERC20PositionWithdrawer.address]
    ),
    deployer.deploy(
      ERC20LongFactory,
      Margin.address,
      [DutchAuctionCloser.address],
      [ERC20PositionWithdrawer.address]
    ),
    deployer.deploy(
      SharedLoanFactory,
      Margin.address,
      getSharedLoanTrustedMarginCallers(network)
    ),
    deployer.deploy(
      PayableMarginMinter,
      Margin.address,
      getWethAddress(network)
    ),
    deployer.deploy(
      BucketLenderFactory,
      Margin.address
    ),
    deployer.deploy(
      EthWrapperForBucketLender,
      getWethAddress(network)
    ),
    deployer.deploy(
      WethPayoutRecipient,
      getWethAddress(network)
    ),
  ]);
}

async function authorizeOnProxy() {
  const proxy = await TokenProxy.deployed();
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
  await deployContracts(deployer, network);
  await Promise.all([
    authorizeOnProxy(),
    grantAccessToVault()
  ]);
}

module.exports = (deployer, network, _addresses) => {
  deployer.then(() => doMigration(deployer, network));
};
