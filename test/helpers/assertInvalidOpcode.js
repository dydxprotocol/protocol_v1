const expect = require('chai').expect;

module.exports = function(error) {
  expect(
    error.message.search('Exception while processing transaction: revert'),
    'revert error must be returned'
  ).to.be.at.least(0);
}
