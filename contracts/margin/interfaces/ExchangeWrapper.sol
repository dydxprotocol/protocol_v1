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
     * Exchange an exact amount of takerToken for makerToken.
     *
     * The exchange wrapper should make sure that allowance is set on the Proxy for the amount of
     * makerToken received (the return value of the function).
     *
     * @param  makerToken           Address of makerToken, the token to receive
     * @param  takerToken           Address of takerToken, the token to pay
     * @param  tradeOriginator      The msg.sender of the first call into the dYdX contract
     * @param  requestedFillAmount  Amount of takerToken being paid
     * @param  orderData            Arbitrary bytes data for any information to pass to the exchange
     * @return                      The amount of makerToken received
     */
    function exchangeSell(
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
     * Exchange takerToken for an exact amount of makerToken.
     *
     * The exchange wrapper should make sure that allowance is set on the Proxy for:
     *  1) desiredMakerToken
     *  2) Its entire balance of takerToken
     *
     * @param  makerToken         Address of makerToken, the token to receive
     * @param  takerToken         Address of takerToken, the token to pay
     * @param  tradeOriginator    The msg.sender of the first call into the dYdX contract
     * @param  desiredMakerToken  Amount of makerToken requested
     * @param  orderData          Arbitrary bytes data for any information to pass to the exchange
     * @return                    The amount of takerToken used
     */
    function exchangeBuy(
        address makerToken,
        address takerToken,
        address tradeOriginator,
        uint256 desiredMakerToken,
        bytes orderData
    )
        external
        /* onlyMargin */
        returns (uint256);
}
