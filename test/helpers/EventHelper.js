/*global*/

const chai = require('chai')
const expect = chai.expect;
chai.use(require('chai-bignumber')());
const BigNumber = require('bignumber.js');

function expectLog(log, name, params) {
  expect(log.event).to.be.equal(name);

  for (let key in params) {

    const expected = params[key];
    const actual = log.args[key];

    if (expected === "unspecified") {
      expect(actual).to.be.not.equal(undefined);
    } else if (actual instanceof BigNumber || expected instanceof BigNumber) {
      expect(actual).to.be.bignumber.equal(new BigNumber(params[key]));
    } else {
      console.log(actual, expected);
      expect(actual).to.be.equal(expected);
    }
  }

  for (let key in log.args) {
    expect(params[key] !== undefined);
  }
}

module.exports = {
  expectLog
};
