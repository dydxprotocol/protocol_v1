pragma solidity 0.4.21;
pragma experimental "v0.5.0";


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
     * @param  addresses  Array of addresses:
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
     * @param  values256  Values corresponding to:
     *
     *  [0] = loan maximum amount
     *  [1] = loan minimum amount
     *  [2] = loan minimum base token
     *  [3] = loan interest rate
     *  [4] = loan lender fee
     *  [5] = loan taker fee
     *  [6] = loan expiration timestamp (in seconds)
     *  [7] = loan salt
     *
     * @param  values32  Values corresponding to:
     *
     *  [0] = loan call time limit (in seconds)
     *  [1] = loan maxDuration (in seconds)
     *  [2] = interest update period (in seconds)
     *
     * @return              true if the contract consents to this loan, false if not.
     *                      If false, the loan will not occur
     */
    function verifyLoanOffering(
        address[9] addresses,
        uint256[8] values256,
        uint32[3] values32,
        bytes32 shortId
    )
        external
        returns (bool);
}
