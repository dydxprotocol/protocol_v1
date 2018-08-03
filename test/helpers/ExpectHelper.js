import expect from './expect';

// For solidity function calls that violate require()
export async function expectThrow(promise) {
  try {
    await promise;
    throw new Error('Did not throw');
  } catch (e) {
    assertCertainError(e, 'Exception while processing transaction: revert');
  }
}

// For solidity function calls that violate assert()
export async function expectAssertFailure(promise) {
  try {
    await promise;
    throw new Error('Did not throw');
  } catch (e) {
    assertCertainError(e, 'Exception while processing transaction: invalid opcode');
  }
}

// Helper function
function assertCertainError(error, expectedErrorMsg) {
  // This complication is so that the actual error will appear in truffle test output
  const { message } = error;
  const matchedIndex = message.search(expectedErrorMsg);
  let matchedString = message;
  if (matchedIndex >= 0) {
    matchedString = message.substring(matchedIndex, matchedIndex + expectedErrorMsg.length);
  }
  expect(matchedString).to.equal(expectedErrorMsg);
}
