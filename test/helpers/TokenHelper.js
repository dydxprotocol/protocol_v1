async function issueAndSetAllowance(
  token,
  account,
  amount,
  allowed
) {
  await Promise.all([
    token.issueTo(account, amount),
    token.approve(allowed, amount, { from: account })
  ]);
}

module.exports = {
  issueAndSetAllowance
};
