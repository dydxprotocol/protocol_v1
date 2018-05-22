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

import { MathHelpers } from "../lib/MathHelpers.sol";


contract TestMathHelpers {

    function getPartialAmount(
        uint256 numerator,
        uint256 denominator,
        uint256 target
    )
        public
        pure
        returns (uint256)
    {
        return MathHelpers.getPartialAmount(numerator, denominator, target);
    }

    function getPartialAmountRoundedUp(
        uint256 numerator,
        uint256 denominator,
        uint256 target
    )
        public
        pure
        returns (uint256)
    {
        return MathHelpers.getPartialAmountRoundedUp(numerator, denominator, target);
    }

    function divisionRoundedUp(
        uint256 numerator,
        uint256 denominator
    )
        public
        pure
        returns (uint256)
    {
        return MathHelpers.divisionRoundedUp(numerator, denominator);
    }

    function maxUint256(
    )
        public
        pure
        returns (uint256)
    {
        return MathHelpers.maxUint256();
    }

    function getNumBits(
        uint256 n
    )
        public
        pure
        returns (uint256)
    {
        return MathHelpers.getNumBits(n);
    }
}
