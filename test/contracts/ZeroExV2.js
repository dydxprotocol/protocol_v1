const TruffleContract = require("truffle-contract");

let ExchangeV2JSON = require("@0xproject/migrations/artifacts/2.0.0-testnet/Exchange.json");
let ProxyV2JSON = require("@0xproject/migrations/artifacts/2.0.0-testnet/ERC20Proxy.json");

ExchangeV2JSON.bytecode = ExchangeV2JSON.compilerOutput.evm.bytecode.object;
ExchangeV2JSON.deployedBytecode = ExchangeV2JSON.compilerOutput.evm.deployedBytecode.object;
ExchangeV2JSON.sourceMap = ExchangeV2JSON.compilerOutput.evm.bytecode.sourceMap;
ExchangeV2JSON.deployedSourceMap = ExchangeV2JSON.compilerOutput.evm.deployedBytecode.sourceMap;
ExchangeV2JSON.abi = ExchangeV2JSON.compilerOutput.abi;

ProxyV2JSON.bytecode = ProxyV2JSON.compilerOutput.evm.bytecode.object;
ProxyV2JSON.deployedBytecode = ProxyV2JSON.compilerOutput.evm.deployedBytecode.object;
ProxyV2JSON.sourceMap = ProxyV2JSON.compilerOutput.evm.bytecode.sourceMap;
ProxyV2JSON.deployedSourceMap = ProxyV2JSON.compilerOutput.evm.deployedBytecode.sourceMap;
ProxyV2JSON.abi = ProxyV2JSON.compilerOutput.abi;

let ZeroExExchangeV2 = TruffleContract(ExchangeV2JSON);
let ZeroExProxyV2 = TruffleContract(ProxyV2JSON);

module.exports = {
  ZeroExExchangeV2,
  ZeroExProxyV2,
  ExchangeV2JSON,
  ProxyV2JSON
};
