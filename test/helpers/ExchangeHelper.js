function callCancelOrder(exchange, order, cancelAmount) {
  const addresses = [
    order.maker,
    order.taker,
    order.makerTokenAddress,
    order.takerTokenAddress,
    order.feeRecipient
  ];

  const values = [
    order.makerTokenAmount,
    order.takerTokenAmount,
    order.makerFee,
    order.takerFee,
    order.expirationUnixTimestampSec,
    order.salt
  ];

  return exchange.cancelOrder(
    addresses,
    values,
    cancelAmount,
    { from: order.maker }
  );
}

module.exports.callCancelOrder = callCancelOrder;
