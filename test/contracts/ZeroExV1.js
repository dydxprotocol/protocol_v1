const TruffleContract = require("truffle-contract");

let ExchangeV1JSON = require("@0xproject/migrations/artifacts/1.0.0/Exchange_v1.json");
let ProxyV1JSON = require("@0xproject/migrations/artifacts/1.0.0/TokenTransferProxy_v1.json");

ExchangeV1JSON.bytecode = ExchangeV1JSON.compilerOutput.evm.bytecode.object;
ExchangeV1JSON.deployedBytecode = ExchangeV1JSON.compilerOutput.evm.deployedBytecode.object;
ExchangeV1JSON.sourceMap = ExchangeV1JSON.compilerOutput.evm.bytecode.sourceMap;
ExchangeV1JSON.deployedSourceMap = ExchangeV1JSON.compilerOutput.evm.deployedBytecode.sourceMap;
ExchangeV1JSON.abi = ExchangeV1JSON.compilerOutput.abi;

ProxyV1JSON.bytecode = ProxyV1JSON.compilerOutput.evm.bytecode.object;
ProxyV1JSON.deployedBytecode = ProxyV1JSON.compilerOutput.evm.deployedBytecode.object;
ProxyV1JSON.sourceMap = ProxyV1JSON.compilerOutput.evm.bytecode.sourceMap;
ProxyV1JSON.deployedSourceMap = ProxyV1JSON.compilerOutput.evm.deployedBytecode.sourceMap;
ProxyV1JSON.abi = ProxyV1JSON.compilerOutput.abi;

let ZeroExExchangeV1 = TruffleContract(ExchangeV1JSON);
let ZeroExProxyV1 = TruffleContract(ProxyV1JSON);

module.exports = {
  ZeroExExchangeV1,
  ZeroExProxyV1,
  ExchangeV1JSON,
  ProxyV1JSON
};
