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

import { TokenInteract } from "../lib/TokenInteract.sol";


/**
 * @title ERC20Position
 * @author dYdX
 *
 * Shared code for ERC20Short and ERC20Long
 */
contract TestERC20Position
{
    using TokenInteract for address;

    address public heldToken;
    uint256 public AMOUNT;

    function setter(
        address token,
        uint256 amount
    )
        external
        returns (uint256)
    {
        heldToken = token;
        AMOUNT = amount;
    }

    function withdraw(
        address /* onBehalfOf */
    )
        external
        returns (uint256)
    {
        heldToken.transfer(msg.sender, AMOUNT);
        return AMOUNT;
    }
}
