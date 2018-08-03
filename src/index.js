const promisify = require("es6-promisify");

const Margin                = require('../build/contracts/Margin.json');
const Vault                 = require('../build/contracts/Vault.json');
const TokenProxy            = require('../build/contracts/TokenProxy.json');
const DutchAuctionCloser    = require('../build/contracts/DutchAuctionCloser.json');
const SharedLoan            = require('../build/contracts/SharedLoan.json');
const SharedLoanCreator     = require('../build/contracts/SharedLoanCreator.json');
const ERC20Position         = require('../build/contracts/ERC20Position.json');
const ERC20Short            = require('../build/contracts/ERC20Short.json');
const ERC20Long             = require('../build/contracts/ERC20Long.json');
const ERC20ShortCreator     = require('../build/contracts/ERC20ShortCreator.json');
const ERC20LongCreator      = require('../build/contracts/ERC20LongCreator.json');
const ERC721MarginLoan      = require('../build/contracts/ERC721MarginLoan.json');
const ERC721MarginPosition  = require('../build/contracts/ERC721MarginPosition.json');
const ZeroExExchangeWrapper = require('../build/contracts/ZeroExExchangeWrapper.json');
const ERC20                 = require('../build/contracts/ERC20.json');
const TestToken             = require('../build/contracts/TestToken.json');

function reset(web3Instance) {
  return promisify(web3Instance.currentProvider.sendAsync)({
    jsonrpc: "2.0",
    method: "evm_revert",
    id: 12345,
    params: ['0x1'],
  });
}

module.exports = {
  Margin,
  Vault,
  TokenProxy,
  DutchAuctionCloser,
  SharedLoan,
  SharedLoanCreator,
  ERC20Position,
  ERC20Short,
  ERC20Long,
  ERC20ShortCreator,
  ERC20LongCreator,
  ERC721MarginLoan,
  ERC721MarginPosition,
  ZeroExExchangeWrapper,
  ERC20,
  TestToken,
  reset
}
