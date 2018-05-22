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
 * @title TimestampHelper
 * @author dYdX
 *
 * Helper to get block timestamps in other formats
 */
library TimestampHelper {
    function getBlockTimestamp32()
        internal
        view
        returns (uint32)
    {
        // Should not still be in-use in the year 2106
        assert(uint256(uint32(block.timestamp)) == block.timestamp);

        assert(block.timestamp > 0);

        return uint32(block.timestamp);
    }
}
