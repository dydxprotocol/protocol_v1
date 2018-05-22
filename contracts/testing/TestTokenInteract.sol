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


contract TestTokenInteract {
    function balanceOf(
        address token,
        address owner
    )
        external
        view
        returns (uint256)
    {
        return TokenInteract.balanceOf(token, owner);
    }

    function allowance(
        address token,
        address owner,
        address spender
    )
        external
        view
        returns (uint256)
    {
        return TokenInteract.allowance(token, owner, spender);
    }

    function approve(
        address token,
        address spender,
        uint256 amount
    )
        external
    {
        TokenInteract.approve(token, spender, amount);
    }

    function transfer(
        address token,
        address to,
        uint256 amount
    )
        external
    {
        TokenInteract.transfer(token, to, amount);
    }

    function transferFrom(
        address token,
        address from,
        address to,
        uint256 amount
    )
        external
    {
        TokenInteract.transferFrom(token, from, to, amount);
    }
}
