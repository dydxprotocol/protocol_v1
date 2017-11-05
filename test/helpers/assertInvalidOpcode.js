const expect = require('chai').expect;

module.exports = function(error) {
  expect(
    error.message.search('invalid opcode'),
    'Invalid opcode error must be returned'
  ).to.be.at.least(0);
}
