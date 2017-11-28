const assertInvalidOpcode = require('../helpers/assertInvalidOpcode');

async function expectThrow(shortTx, call) {
  try {
    await call();
    throw new Error('Did not throw');
  } catch (e) {
    assertInvalidOpcode(e);
  }
}

module.exports.expectThrow = expectThrow;
