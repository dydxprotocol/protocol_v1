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

import { MarginCommon } from "../impl/MarginCommon.sol";


/**
 * @title LoanOfferingVerifier
 * @author dYdX
 *
 * Interface that smart contracts must implement to be able to make off-chain generated
 * loan offerings.
 *
 * NOTE: Any contract implementing this interface should also use OnlyMargin to control access
 *       to these functions
 */
contract LoanOfferingVerifier {

    // ============ Margin-Only State-Changing Functions ============

    /**
     * Function a smart contract must implement to be able to consent to a loan. The loan offering
     * will be generated off-chain. The "loan owner" address will own the loan-side of the resulting
     * position.
     *
     * If true is returned, and no errors are thrown by the Margin contract, the loan will have
     * occurred. This means that verifyLoanOffering can also be used to update internal contract
     * state on a loan.
     *
     * @param  addresses    Array of addresses:
     *
     *  [0] = owedToken
     *  [1] = heldToken
     *  [2] = loan payer
     *  [3] = loan owner
     *  [4] = loan taker
     *  [5] = loan positionOwner
     *  [6] = loan fee recipient
     *  [7] = loan lender fee token
     *  [8] = loan taker fee token
     *
     * @param  values256    Values corresponding to:
     *
     *  [0] = loan maximum amount
     *  [1] = loan minimum amount
     *  [2] = loan minimum heldToken
     *  [3] = loan lender fee
     *  [4] = loan taker fee
     *  [5] = loan expiration timestamp (in seconds)
     *  [6] = loan salt
     *
     * @param  values32     Values corresponding to:
     *
     *  [0] = loan call time limit (in seconds)
     *  [1] = loan maxDuration (in seconds)
     *  [2] = loan interest rate (annual nominal percentage times 10**6)
     *  [3] = loan interest update period (in seconds)
     *
     * @param  positionId   Unique ID of the position
     * @param  signature    Arbitrary bytes; may or may not be an ECDSA signature
     * @return              This address to accept, a different address to ask that contract
     */
    function verifyLoanOffering(
        address[9] addresses,
        uint256[7] values256,
        uint32[4] values32,
        bytes32 positionId,
        bytes signature
    )
        external
        /* onlyMargin */
        returns (address);

    // ============ Parsing Functions ============

    function parseLoanOffering(
        address[9] addresses,
        uint256[7] values256,
        uint32[4] values32,
        bytes signature
    )
        internal
        pure
        returns (MarginCommon.LoanOffering memory)
    {
        MarginCommon.LoanOffering memory loanOffering;

        fillLoanOfferingAddresses(loanOffering, addresses);
        fillLoanOfferingValues256(loanOffering, values256);
        fillLoanOfferingValues32(loanOffering, values32);
        loanOffering.signature = signature;

        return loanOffering;
    }

    function fillLoanOfferingAddresses(
        MarginCommon.LoanOffering memory loanOffering,
        address[9] addresses
    )
        private
        pure
    {
        loanOffering.owedToken = addresses[0];
        loanOffering.heldToken = addresses[1];
        loanOffering.payer = addresses[2];
        loanOffering.owner = addresses[3];
        loanOffering.taker = addresses[4];
        loanOffering.positionOwner = addresses[5];
        loanOffering.feeRecipient = addresses[6];
        loanOffering.lenderFeeToken = addresses[7];
        loanOffering.takerFeeToken = addresses[8];
    }

    function fillLoanOfferingValues256(
        MarginCommon.LoanOffering memory loanOffering,
        uint256[7] values256
    )
        private
        pure
    {
        loanOffering.rates.maxAmount = values256[0];
        loanOffering.rates.minAmount = values256[1];
        loanOffering.rates.minHeldToken = values256[2];
        loanOffering.rates.lenderFee = values256[3];
        loanOffering.rates.takerFee = values256[4];
        loanOffering.expirationTimestamp = values256[5];
        loanOffering.salt = values256[6];
    }

    function fillLoanOfferingValues32(
        MarginCommon.LoanOffering memory loanOffering,
        uint32[4] values32
    )
        private
        pure
    {
        loanOffering.callTimeLimit = values32[0];
        loanOffering.maxDuration = values32[1];
        loanOffering.rates.interestRate = values32[2];
        loanOffering.rates.interestPeriod = values32[3];
    }
}
