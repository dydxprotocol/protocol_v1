const Margin                = require('./build/contracts/Margin.json');
const Vault                 = require('./build/contracts/Vault.json');
const Proxy                 = require('./build/contracts/Proxy.json');
const DutchAuctionCloser    = require('./build/contracts/DutchAuctionCloser.json');
const SharedLoan            = require('./build/contracts/SharedLoan.json');
const SharedLoanCreator     = require('./build/contracts/SharedLoanCreator.json');
const ERC20Position         = require('./build/contracts/ERC20Position.json');
const ERC20Short            = require('./build/contracts/ERC20Short.json');
const ERC20Long             = require('./build/contracts/ERC20Long.json');
const ERC20ShortCreator     = require('./build/contracts/ERC20ShortCreator.json');
const ERC20LongCreator      = require('./build/contracts/ERC20LongCreator.json');
const ERC721MarginLoan      = require('./build/contracts/ERC721MarginLoan.json');
const ERC721MarginPosition  = require('./build/contracts/ERC721MarginPosition.json');
const ZeroExExchangeWrapper = require('./build/contracts/ZeroExExchangeWrapper.json');

module.exports = {
  Margin,
  Vault,
  Proxy,
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
  ZeroExExchangeWrapper
}
