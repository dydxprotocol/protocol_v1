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
        ECRECOVER_NUL,
        ECRECOVER_DEC,
        ECRECOVER_HEX,
        UNSUPPORTED
    }

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

        bytes32 recoveryHash;
        if (sigType == SignatureType.ECRECOVER_NUL) {
            recoveryHash = hash;
        } else if (sigType == SignatureType.ECRECOVER_DEC) {
            recoveryHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hash));
        } else if (sigType == SignatureType.ECRECOVER_HEX) {
            recoveryHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n\x20", hash));
        } else {
            assert(sigType == SignatureType.INVALID);
            revert("SignatureValidator#validateSignature: invalid signature type");
        }

        return ecrecover(
            recoveryHash,
            v,
            r,
            s
        );
    }
}
