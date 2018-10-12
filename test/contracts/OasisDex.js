const TruffleContract = require("truffle-contract");

let MatchingMarketJSON = require("./json/MatchingMarket.json");

let MatchingMarket = TruffleContract(MatchingMarketJSON);

module.exports = {
  MatchingMarket,
  MatchingMarketJSON,
};
