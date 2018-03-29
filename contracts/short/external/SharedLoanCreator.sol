pragma solidity 0.4.19;

import { LoanOwner } from "../interfaces/LoanOwner.sol";


/**
 * @title SharedLoanCreator
 * @author dYdX
 *
 * This contract is used to deploy new SharedLoan contracts. A new SharedLoan is automatically
 * deployed whenever a loan is transferred to this contract. That loan is then transferred to the
 * new SharedLoan, with the initial allocation going to the address that transferred the
 * loan originally to the SharedLoanCreator.
 */
/* solium-disable-next-line */
contract SharedLoanCreator is
    LoanOwner
{
    // -------------------
    // ------ Events -----
    // -------------------

    event SharedLoanCreated(
        bytes32 shortId,
        address sharedLoanAddress
    );

    // ----------------------------
    // ------ State Variables -----
    // ----------------------------

    // Addresses of recipients that will fairly verify and redistribute funds from closing the short
    address[] public TRUSTED_LOAN_CALLERS;

    // ------------------------
    // ------ Constructor -----
    // ------------------------

    function SharedLoanCreator(
        address shortSell,
        address[] trustedLoanCallers
    )
        public
        ShortOwner(shortSell)
    {
        for (uint256 i = 0; i < trustedLoanCallers.length; i++) {
            TRUSTED_LOAN_CALLERS.push(trustedLoanCallers[i]);
        }
    }


}
