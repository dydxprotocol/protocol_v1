const TruffleContract = require("truffle-contract");

const MatchingMarketV1JSON = require("./json/MatchingMarketV1.json");
const MatchingMarketV2JSON = require("./json/MatchingMarketV2.json");

const MatchingMarketV1 = TruffleContract(MatchingMarketV1JSON);
const MatchingMarketV2 = TruffleContract(MatchingMarketV2JSON);

module.exports = {
  MatchingMarketV1,
  MatchingMarketV2,
};
