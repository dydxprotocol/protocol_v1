const chai = require('chai')
const expect = chai.expect;
chai.use(require('chai-bignumber')());
const BigNumber = require('bignumber.js');

function expectLog(log, name, params) {
  const nameErrorMessage = 'event ' + name + ' had incorrect name';
  expect(log, nameErrorMessage).to.be.not.equal(undefined);
  expect(log.event, nameErrorMessage).to.be.equal(name);

  for (let key in params) {
    const expected = params[key];
    const actual = log.args[key];

    const errorMessage = key + ' was incorrect in event ' + name;

    if (expected === "unspecified") {
      expect(actual, errorMessage).to.be.not.equal(undefined);
    } else if (actual instanceof Object || expected instanceof Object) {
      expect(actual, errorMessage).to.be.bignumber.equal(new BigNumber(params[key]));
    } else {
      expect(actual, errorMessage).to.be.equal(expected);
    }
  }

  for (let key in log.args) {
    expect(
      params[key] !== undefined && params[key] !== null,
      'did not test for \'' + key + '\' in the event \'' + name + '\''
    ).to.be.true;
  }
}

module.exports = {
  expectLog
};
