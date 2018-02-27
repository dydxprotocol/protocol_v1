pragma solidity 0.4.19;


/**
 * @title LoanOfferingVerifier
 * @author dYdX
 *
 * Interface that smart contracts must implement to be able to make off-chain generated
 * loan offerings
 */
contract LoanOfferingVerifier {
    /**
     * Function a smart contract must implement to be able to consent to a loan. The loan offering
     * will be generated off-chain and signed by a signer. The ShortSell contract will verify that
     * the signature for the loan offering was made by signer. If "owner" is a non-zero address,
     * then it will be the lender, otherwise the implementing contract will be the lender.
     *
     * If true is returned, and no errors are thrown by the ShortSell contract, the loan will have
     * occurred. This means that verifyLoanOffering can also be used to update internal contract
     * state on a loan.
     *
     * @param  addresses        Array of addresses:
     *
     *  [0] = underlying token
     *  [1] = base token
     *  [2] = lender
     *  [3] = signer
     *  [4] = owner
     *  [5] = loan taker
     *  [6] = loan fee recipient
     *  [7] = loan lender fee token
     *  [8] = loan taker fee token
     *
     * @param  values256        Values corresponding to:
     *
     *  [0] = loan minimum deposit
     *  [1] = loan maximum amount
     *  [2] = loan minimum amount
     *  [3] = loan minimum sell amount
     *  [4] = loan interest rate
     *  [5] = loan lender fee
     *  [6] = loan taker fee
     *  [7] = loan expiration timestamp (in seconds)
     *  [8] = loan salt
     *
     * @param  values32         Values corresponding to:
     *
     *  [0] = loan call time limit  (in seconds)
     *  [1] = loan maxDuration      (in seconds)
     *
     * @return _isValid     true if the contract consents to this loan, false if not.
     *                      If false, the loan will not occur
     */
    function verifyLoanOffering(
        address[9] addresses,
        uint[9] values256,
        uint32[2] values32,
        bytes32 shortId
    )
        external
        returns (bool _isValid);
}
