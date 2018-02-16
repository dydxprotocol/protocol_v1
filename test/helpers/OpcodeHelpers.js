const expect = require('chai').expect;

function assertRevert(error) {
  expect(
    error.message.search('Exception while processing transaction: revert'),
    'revert error must be returned'
  ).to.be.at.least(0);
}

function assertInvalidOpcode(error) {
  expect(
    error.message.search('Exception while processing transaction: invalid opcode'),
    'invalid opcode error must be returned'
  ).to.be.at.least(0);
}

module.exports = {
  assertRevert,
  assertInvalidOpcode,
}
