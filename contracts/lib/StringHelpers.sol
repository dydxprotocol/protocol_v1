pragma solidity 0.4.21;
pragma experimental "v0.5.0";


/**
 * @title StringHelpers
 * @author dYdX
 *
 * This library helps with string manipulation in Solidity
 */
library StringHelpers {

    /**
     * Concatenates two byte arrays and return the result
     *
     * @param  stringA  The string that goes first
     * @param  stringB  The string that goes second
     * @return          The two strings concatenated
     */
    function strcat(
        bytes stringA,
        bytes stringB
    )
        internal
        pure
        returns (bytes)
    {
        uint256 lengthA = stringA.length;
        uint256 lengthB = stringB.length;
        bytes memory result = new bytes(lengthA + lengthB);

        uint256 i = 0;
        for (i = 0; i < lengthA; i++) {
            result[i] = stringA[i];
        }
        for (i = 0; i < lengthB; i++) {
            result[lengthA + i] = stringB[i];
        }
        return result;
    }

    /**
     * Translates a bytes32 into an ascii hexadecimal representation of those bytes
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
        bytes memory numberAsString = new bytes(64);
        uint256 number = uint256(input);

        for (uint256 n = 0; n < 32; n++) {
            uint256 nthByte = number / uint256(uint256(2) ** uint256(248 - 8 * n));

            // 1 byte to 2 hexadecimal numbers
            uint8 hex1 = uint8(nthByte) / uint8(16);
            uint8 hex2 = uint8(nthByte) % uint8(16);

            // 87 is ascii for '0', 48 is ascii for 'a'
            hex1 += (hex1 > 9) ? 87 : 48; // shift into proper ascii value
            hex2 += (hex2 > 9) ? 87 : 48; // shift into proper ascii value
            numberAsString[2 * n] = byte(hex1);
            numberAsString[2 * n + 1] = byte(hex2);
        }
        return numberAsString;
    }
}
