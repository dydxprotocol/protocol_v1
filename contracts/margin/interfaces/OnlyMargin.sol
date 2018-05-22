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


/**
 * @title OnlyMargin
 * @author dYdX
 *
 * Contract to store the address of the main Margin contract and trust only that address to call
 * certain functions.
 */
contract OnlyMargin {

    // ============ Constants ============

    // Address of the known and trusted Margin contract on the blockchain
    address public DYDX_MARGIN;

    // ============ Constructor ============

    constructor(
        address margin
    )
        public
    {
        DYDX_MARGIN = margin;
    }

    // ============ Modifiers ============

    modifier onlyMargin()
    {
        require(
            msg.sender == DYDX_MARGIN,
            "OnlyMargin#onlyMargin: Only Margin can call"
        );

        _;
    }
}
