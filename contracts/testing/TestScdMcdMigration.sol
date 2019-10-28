/*

    Copyright 2019 dYdX Trading Inc.

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
import { IScdMcdMigration } from "../external/Maker/Other/IScdMcdMigration.sol";


contract TestScdMcdMigration is
    IScdMcdMigration
{
    using TokenInteract for address;

    address public SAI;
    address public DAI;

    constructor(
        address sai,
        address dai
    )
        public
    {
        SAI = sai;
        DAI = dai;
    }

    function swapSaiToDai(
        uint256 wad
    )
        external
    {
        SAI.transferFrom(msg.sender, address(this), wad);
        DAI.transfer(msg.sender, wad);
    }

    function swapDaiToSai(
        uint256 wad
    )
        external
    {
        DAI.transferFrom(msg.sender, address(this), wad);
        SAI.transfer(msg.sender, wad);
    }
}
