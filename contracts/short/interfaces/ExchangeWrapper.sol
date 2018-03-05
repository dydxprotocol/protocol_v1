pragma solidity 0.4.19;


contract ExchangeWrapper {
    function exchange(
        address makerToken,
        address takerToken,
        address tradeOriginator,
        uint256 requestedFillAmount,
        bytes orderData
    )
        external
        returns (uint256 _receivedMakerTokenAmount);

    function getTakerTokenPrice(
        address makerToken,
        address takerToken,
        uint256 desiredMakerToken,
        bytes orderData
    )
        external
        view
        returns (uint256 _requiredTakerToken);
}
