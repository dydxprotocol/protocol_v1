pragma solidity 0.4.19;


/**
 * @title ExchangeWrapper
 * @author dYdX
 *
 * Contract interface that Exchange Wrapper smart contracts must implement in order to be used to
 * open or close positions on the dYdX using external exchanges.
 */
contract ExchangeWrapper {

    /**
     * Attempt to exchange some amount of takerToken for makerTokens.
     *
     * @param  makerToken           Address of the maker token, the token to recieve
     * @param  takerToken           Address of the taker token, the token to pay
     * @param  tradeOriginator      The msg.sender of the first call into the dYdX contract
     * @param  requestedFillAmount  Amount of taker token being paid
     * @param  orderData            Arbitrary bytes data for any information to pass to the exchange
     * @return                      The amount of makerToken recieved
     */
    function exchange(
        address makerToken,
        address takerToken,
        address tradeOriginator,
        uint256 requestedFillAmount,
        bytes orderData
    )
        external
        returns (uint256);

    /**
     * Get amount of takerToken required to buy a certain amount of makerToken given some orderData.
     *
     * @param  makerToken         Address of the maker token, the token to recieve
     * @param  takerToken         Address of the taker token, the token to pay
     * @param  desiredMakerToken  Amount of maker token requested
     * @param  orderData          Arbitrary bytes data for any information to pass to the exchange
     * @return                    Amount of takerToken the needed to complete the transaction
     */
    function getTakerTokenPrice(
        address makerToken,
        address takerToken,
        uint256 desiredMakerToken,
        bytes orderData
    )
        external
        view
        returns (uint256);
}
