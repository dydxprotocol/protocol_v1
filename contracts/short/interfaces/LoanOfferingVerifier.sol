pragma solidity 0.4.19;


/**
 * @title LoanOfferingVerifier
 * @author Antonio Juliano
 *
 * Interface that smart contracts must implement to be able to make off-chain generated
 * loan offerings
 */
contract LoanOfferingVerifier {
    /**
     * Function a smart contract must implement to be able to consent to a loan. The loan offering
     * will be generated off-chain and signed by a signer. The ShortSell contract will verify that
     * the signature for the loan offering was made by signer. The implementing contract will be
     * the lender for the loan.
     *
     * If true is returned, and no errors are thrown by the ShortSell contract, the loan will have
     * occurred. This means that verifyLoanOffering can also be used to update internal contract
     * state on a loan.
     *
     * @return _isValid     true if the contract consents to this loan, false if not.
     *                      If false, the loan will not occur
     */
    function verifyLoanOffering(
        address[8] addresses,
        uint[9] values256,
        uint32[3] values32
    )
        external
        returns (bool _isValid);
}
