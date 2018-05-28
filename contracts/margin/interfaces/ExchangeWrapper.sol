/*

    Copyright 2018 dYdX Trading Inc.

    Licensed under the Apache License, Version 2.0 (the "License");
    you may not use this file except in compliance with the License.
    You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

    Unless required by applicable law or agreed to in writing, software
    distributed under the License is distributed on an "AS IS" BASIS,
    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
    See the License for the specific language governing permissions and
    limitations under the License.

*/

pragma solidity 0.4.24;
pragma experimental "v0.5.0";

import { OnlyMargin } from "./OnlyMargin.sol";


/**
 * @title ExchangeWrapper
 * @author dYdX
 *
 * Contract interface that Exchange Wrapper smart contracts must implement in order to be used to
 * open or close positions on the dYdX using external exchanges.
 *
 * NOTE: Any contract implementing this interface should also use OnlyMargin to control access
 *       to these functions
 */
contract ExchangeWrapper is OnlyMargin {

    // ============ Constants ============

    address public DYDX_PROXY;

    // ============ Constructor ============

    constructor(
        address margin,
        address dydxProxy
    )
        public
        OnlyMargin(margin)
    {
        DYDX_PROXY = dydxProxy;
    }

    // ============ External Functions ============

    /**
     * Exchange some amount of takerToken for makerToken.
     *
     * @param  makerToken           Address of makerToken, the token to receive
     * @param  takerToken           Address of takerToken, the token to pay
     * @param  tradeOriginator      The msg.sender of the first call into the dYdX contract
     * @param  requestedFillAmount  Amount of takerToken being paid
     * @param  orderData            Arbitrary bytes data for any information to pass to the exchange
     * @return                      The amount of makerToken received
     */
    function exchange(
        address makerToken,
        address takerToken,
        address tradeOriginator,
        uint256 requestedFillAmount,
        bytes orderData
    )
        external
        /* onlyMargin */
        returns (uint256);

    /**
     * Get amount of takerToken required to buy a certain amount of makerToken for a given trade.
     * Should match the takerToken amount used in exchangeForAmount. If the order cannot provide
     * exactly desiredMakerToken, then it must return the price to buy the minimum amount greater
     * than desiredMakerToken
     *
     * @param  makerToken         Address of makerToken, the token to receive
     * @param  takerToken         Address of takerToken, the token to pay
     * @param  desiredMakerToken  Amount of makerToken requested
     * @param  orderData          Arbitrary bytes data for any information to pass to the exchange
     * @return                    Amount of takerToken the needed to complete the transaction
     */
    function getExchangeCost(
        address makerToken,
        address takerToken,
        uint256 desiredMakerToken,
        bytes orderData
    )
        external
        view
        returns (uint256);
}
