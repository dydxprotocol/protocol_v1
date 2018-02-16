const {
  assertInvalidOpcode,
  assertRevert,
} = require('../helpers/OpcodeHelpers');

async function expectThrow(call) {
  try {
    await call();
    throw new Error('Did not throw');
  } catch (e) {
    assertRevert(e);
  }
}

async function expectAssertFailure(call) {
  try {
    await call();
    throw new Error('Did not throw');
  } catch (e) {
    assertInvalidOpcode(e);
  }
}

module.exports.expectThrow = expectThrow;
module.exports.expectAssertFailure = expectAssertFailure;
