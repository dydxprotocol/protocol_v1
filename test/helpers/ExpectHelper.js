const expect = require('chai').expect;

// For solidity function calls that violate require()
async function expectThrow(promise) {
  try {
    await promise;
    throw new Error('Did not throw');
  } catch (e) {
    assertCertainError(e, 'Exception while processing transaction: revert');
  }
}

// For solidity function calls that violate assert()
async function expectAssertFailure(promise) {
  try {
    await promise;
    throw new Error('Did not throw');
  } catch (e) {
    assertCertainError(e, 'Exception while processing transaction: invalid opcode');
  }
}

// Helper function
function assertCertainError(error, expected_error_msg) {
  // This complication is so that the actual error will appear in truffle test output
  const message = error.message;
  const matchedIndex = message.search(expected_error_msg);
  let matchedString = message;
  if (matchedIndex >= 0) {
    matchedString = message.substring(matchedIndex, matchedIndex + expected_error_msg.length);
  }
  expect(matchedString).to.equal(expected_error_msg);
}

module.exports = {
  expectThrow,
  expectAssertFailure
};
