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
 * @title ECRecovery
 * @author dYdX
 *
 * Based on OpenZeppelin's ECRecovery contract. Allows for ecrecovery of signed messages with three
 * different prepended messages:
 *
 * 1) ""
 * 2) "\x19Ethereum Signed Message:\n32"
 * 3) "\x19Ethereum Signed Message:\n\x20"
 */
library ECRecovery {

    enum SignatureType {
        INVALID,
        ECRECOVER_NULL,
        ECRECOVER_DEC,
        ECRECOVER_HEX,
        UNSUPPORTED
    }

    // prepended message with the length of the signed hash in hexadecimal
    bytes constant private PREPEND_HEX = "\x19Ethereum Signed Message:\n\x20";

    // prepended message with the length of the signed hash in decimal
    bytes constant private PREPEND_DEC = "\x19Ethereum Signed Message:\n32";

    /**
     * Gives the address of the signer of a hash. Allows for three common prepended strings.
     *
     * @param  hash               Hash that was signed (does not include prepended message)
     * @param  signatureWithType  Type and ECDSA signature with structure: {1:type}{1:v}{32:r}{32:s}
     * @return                    address of the signer of the hash
     */
    function recover(
        bytes32 hash,
        bytes signatureWithType
    )
        internal
        pure
        returns (address)
    {
        require(
            signatureWithType.length == 66,
            "SignatureValidator#validateSignature: invalid signature length"
        );

        uint8 rawSigType = uint8(signatureWithType[0]);

        require(
            rawSigType > uint8(SignatureType.INVALID),
            "SignatureValidator#validateSignature: invalid signature type"
        );
        require(
            rawSigType < uint8(SignatureType.UNSUPPORTED),
            "SignatureValidator#validateSignature: unsupported signature type"
        );

        SignatureType sigType = SignatureType(rawSigType);
        uint8 v = uint8(signatureWithType[1]);
        bytes32 r;
        bytes32 s;

        /* solium-disable-next-line security/no-inline-assembly */
        assembly {
            r := mload(add(signatureWithType, 34))
            s := mload(add(signatureWithType, 66))
        }

        bytes32 signedHash;
        if (sigType == SignatureType.ECRECOVER_NULL) {
            signedHash = hash;
        } else if (sigType == SignatureType.ECRECOVER_DEC) {
            signedHash = keccak256(abi.encodePacked(PREPEND_DEC, hash));
        } else if (sigType == SignatureType.ECRECOVER_HEX) {
            signedHash = keccak256(abi.encodePacked(PREPEND_HEX, hash));
        }

        return ecrecover(
            signedHash,
            v,
            r,
            s
        );
    }
}
