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

import { Math } from "openzeppelin-solidity/contracts/math/Math.sol";
import { SafeMath } from "openzeppelin-solidity/contracts/math/SafeMath.sol";
import { StaticAccessControlled } from "../lib/StaticAccessControlled.sol";
import { TokenInteract } from "../lib/TokenInteract.sol";


/**
 * @title TokenProxy
 * @author dYdX
 *
 * Used to transfer tokens between addresses which have set allowance on this contract.
 */
contract TokenProxy is StaticAccessControlled {
    using SafeMath for uint256;

    // ============ Constructor ============

    constructor(
        uint256 gracePeriod
    )
        public
        StaticAccessControlled(gracePeriod)
    {}

    // ============ Authorized-Only State Changing Functions ============

    /**
     * Transfers tokens from an address (that has set allowance on the proxy) to another address.
     *
     * @param  token  The address of the ERC20 token
     * @param  from   The address to transfer token from
     * @param  to     The address to transfer tokens to
     * @param  value  The number of tokens to transfer
     */
    function transferTokens(
        address token,
        address from,
        address to,
        uint256 value
    )
        external
        requiresAuthorization
    {
        TokenInteract.transferFrom(
            token,
            from,
            to,
            value
        );
    }

    // ============ Public Constant Functions ============

    /**
     * Getter function to get the amount of token that the proxy is able to move for a particular
     * address. The minimum of 1) the balance of that address and 2) the allowance given to proxy.
     *
     * @param  who    The owner of the tokens
     * @param  token  The address of the ERC20 token
     * @return        The number of tokens able to be moved by the proxy from the address specified
     */
    function available(
        address who,
        address token
    )
        external
        view
        returns (uint256)
    {
        return Math.min256(
            TokenInteract.allowance(token, who, address(this)),
            TokenInteract.balanceOf(token, who)
        );
    }
}
