pragma solidity 0.4.21;
pragma experimental "v0.5.0";


/**
 * @title ExchangeWrapper
 * @author dYdX
 *
 * Contract interface that Exchange Wrapper smart contracts must implement in order to be used to
 * open or close positions on the dYdX using external exchanges.
 */
contract ExchangeWrapper {

    /**
     * Exchange some amount of takerToken for makerTokens.
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
     * Exchange taker tokens for an exact amount of maker tokens. Any extra maker tokens exist
     * as a result of the trade will be left in the exchange wrapper
     *
     * @param  makerToken           Address of the maker token, the token to recieve
     * @param  takerToken           Address of the taker token, the token to pay
     * @param  tradeOriginator      The msg.sender of the first call into the dYdX contract
     * @param  desiredMakerToken    Amount of maker token requested
     * @param  orderData            Arbitrary bytes data for any information to pass to the exchange
     * @return                      The amount of takerToken used
     */
    function exchangeForAmount(
        address makerToken,
        address takerToken,
        address tradeOriginator,
        uint256 desiredMakerToken,
        bytes orderData
    )
        external
        returns (uint256);

    /**
     * Get amount of makerToken that will be paid out by exchange for a given trade. Should match
     * the amount of maker token returned by exchange
     *
     * @param  makerToken           Address of the maker token, the token to recieve
     * @param  takerToken           Address of the taker token, the token to pay
     * @param  requestedFillAmount  Amount of taker token being paid
     * @param  orderData            Arbitrary bytes data for any information to pass to the exchange
     * @return                      The amount of makerToken that would be recieved as a result of
     *                              taking this trade
     */
    function getTradeMakerTokenAmount(
        address makerToken,
        address takerToken,
        uint256 requestedFillAmount,
        bytes orderData
    )
        external
        view
        returns (uint256);

    /**
     * Get amount of takerToken required to buy a certain amount of makerToken for a given trade.
     * Should match the taker token amount used in exchangeForAmount
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
