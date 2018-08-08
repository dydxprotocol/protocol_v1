const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());
const promisify = require("es6-promisify");
const ethUtil = require('ethereumjs-util');
const Web3 = require('web3');
const web3Instance = new Web3(web3.currentProvider);

const TestTypedSignature = artifacts.require("TestTypedSignature");
const { BYTES32, SIGNATURE_TYPE } = require('../../helpers/Constants');
const { expectThrow } = require('../../helpers/ExpectHelper');

contract('TestTypedSignature', accounts => {
  let contract;
  const rawKey = "43f2ee33c522046e80b67e96ceb84a05b60b9434b0ee2e3ae4b1311b9f5dcc46";
  const privateKey = Buffer.from(rawKey, "hex");
  const signer = "0x" + ethUtil.privateToAddress(privateKey).toString("hex");
  const hash = BYTES32.TEST[0];
  const PROPER_SIG_LENGTH = 66;

  before(async () => {
    contract = await TestTypedSignature.new();
  });

  describe('INVALID', () => {
    it("fails when invalid type (zero)", async () => {
      const signature = await promisify(web3Instance.eth.sign)(hash, accounts[0]);
      const { v, r, s } = ethUtil.fromRpcSig(signature);
      const signatureWithType = getSignature(SIGNATURE_TYPE.INVALID, v, r, s);
      await expectThrow(contract.recover(hash, signatureWithType));
    });

    it("fails when unsupported type (3)", async () => {
      const signature = await promisify(web3Instance.eth.sign)(hash, accounts[0]);
      const { v, r, s } = ethUtil.fromRpcSig(signature);
      const signatureWithType = getSignature(SIGNATURE_TYPE.UNSUPPORTED, v, r, s);
      await expectThrow(contract.recover(hash, signatureWithType));
    });

    it("fails when unsupported type (>3)", async () => {
      const signature = await promisify(web3Instance.eth.sign)(hash, accounts[0]);
      const { v, r, s } = ethUtil.fromRpcSig(signature);
      const signatureWithType = getSignature(SIGNATURE_TYPE.UNSUPPORTED_LARGE, v, r, s);
      await expectThrow(contract.recover(hash, signatureWithType));
    });

    it("fails when too short", async () => {
      const n = Buffer.from("12345678123456781234567812345678");
      const tooShort = Buffer.concat([n, n]);
      const signatureWithType = ethUtil.bufferToHex(tooShort);
      expect(tooShort.length).to.be.lt(PROPER_SIG_LENGTH);
      await expectThrow(contract.recover(hash, signatureWithType));
    });

    it("fails when too long", async () => {
      const n = Buffer.from("12345678123456781234567812345678");
      const tooLong = Buffer.concat([n, n, n, n]);
      const signatureWithType = ethUtil.bufferToHex(tooLong);
      expect(tooLong.length).to.be.gt(PROPER_SIG_LENGTH);
      await expectThrow(contract.recover(hash, signatureWithType));
    });
  });

  describe('ECRECOVERY_DEC', () => {
    it("returns the correct signer", async () => {
      const signer = accounts[0];
      const signature = await promisify(web3Instance.eth.sign)(hash, accounts[0]);
      const { v, r, s } = ethUtil.fromRpcSig(signature);

      const signatureWithType = getSignature(SIGNATURE_TYPE.DEC, v, r, s);
      const retVal = await contract.recover(hash, signatureWithType);
      expect(retVal).to.equal(signer);
    });
  });

  describe('ECRECOVERY_HEX', () => {
    it("returns the correct signer", async () => {
      const packed = "\x19Ethereum Signed Message:\n\x20" + ethUtil.toBuffer(hash);
      const hash2 = "0x" + ethUtil.sha3(Buffer.from(packed, 32)).toString("hex");
      const ecSignature = ethUtil.ecsign(ethUtil.toBuffer(hash2), privateKey);
      const { v, r, s } = ecSignature;
      const signatureWithType = getSignature(SIGNATURE_TYPE.HEX, v, r, s);
      const retVal = await contract.recover.call(hash, signatureWithType);
      expect(retVal).to.equal(signer);
    });
  });
});

function getSignature(type, v, r, s) {
  return ethUtil.bufferToHex(
    Buffer.concat([
      ethUtil.toBuffer(type),
      ethUtil.toBuffer(v),
      r,
      s,
    ])
  );
}
