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
 * @title StringHelpers
 * @author dYdX
 *
 * This library helps with string manipulation in Solidity
 */
library StringHelpers {
    /**
     * Translates a bytes32 to an ascii hexadecimal representation starting with "0x"
     *
     * @param  input  The bytes to convert to hexadecimal
     * @return        A representation of the bytes in ascii hexadecimal
     */
    function bytes32ToHex(
        bytes32 input
    )
        internal
        pure
        returns (bytes)
    {
        uint256 number = uint256(input);
        bytes memory numberAsString = new bytes(66); // "0x" and then 2 chars per byte
        numberAsString[0] = byte(48);  // '0'
        numberAsString[1] = byte(120); // 'x'

        for (uint256 n = 0; n < 32; n++) {
            uint256 nthByte = number / uint256(uint256(2) ** uint256(248 - 8 * n));

            // 1 byte to 2 hexadecimal numbers
            uint8 hex1 = uint8(nthByte) / uint8(16);
            uint8 hex2 = uint8(nthByte) % uint8(16);

            // 87 is ascii for '0', 48 is ascii for 'a'
            hex1 += (hex1 > 9) ? 87 : 48; // shift into proper ascii value
            hex2 += (hex2 > 9) ? 87 : 48; // shift into proper ascii value
            numberAsString[2 * n + 2] = byte(hex1);
            numberAsString[2 * n + 3] = byte(hex2);
        }
        return numberAsString;
    }
}
