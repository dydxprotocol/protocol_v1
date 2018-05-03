pragma solidity 0.4.23;
pragma experimental "v0.5.0";

import { ReentrancyGuard } from "zeppelin-solidity/contracts/ReentrancyGuard.sol";
import { NoOwner } from "zeppelin-solidity/contracts/ownership/NoOwner.sol";
import { SharedLoan } from "./SharedLoan.sol";
import { LoanOwner } from "../interfaces/LoanOwner.sol";
import { OnlyMargin } from "../interfaces/OnlyMargin.sol";


/**
 * @title SharedLoanCreator
 * @author dYdX
 *
 * This contract is used to deploy new SharedLoan contracts. A new SharedLoan is automatically
 * deployed whenever a loan is transferred to this contract. That loan is then transferred to the
 * new SharedLoan, with the initial allocation going to the address that transferred the
 * loan originally to the SharedLoanCreator.
 */
contract SharedLoanCreator is
    ReentrancyGuard,
    NoOwner,
    OnlyMargin,
    LoanOwner
{
    // ============ Events ============

    event SharedLoanCreated(
        bytes32 positionId,
        address sharedLoanAddress
    );

    // ============ State Variables ============

    // Recipients that will fairly verify and redistribute funds from closing the position
    address[] public TRUSTED_MARGIN_CALLERS;

    // ============ Constructor ============

    constructor(
        address margin,
        address[] trustedLoanCallers
    )
        public
        OnlyMargin(margin)
    {
        for (uint256 i = 0; i < trustedLoanCallers.length; i++) {
            TRUSTED_MARGIN_CALLERS.push(trustedLoanCallers[i]);
        }
    }

    // ============ Margin-Only Functions ============

    /**
     * Implementation of LoanOwner functionality. Creates a new SharedLoan and assigns loan
     * ownership to the SharedLoan. Called by Margin when a loan is transferred to this
     * contract.
     *
     * @param  from  Address of the previous owner of the loan
     * @return       Address of the new SharedLoan contract
     */
    function receiveLoanOwnership(
        address from,
        bytes32 positionId
    )
        external
        onlyMargin
        returns (address)
    {
        address sharedLoanAddress = new SharedLoan(
            positionId,
            DYDX_MARGIN,
            from,
            TRUSTED_MARGIN_CALLERS
        );

        emit SharedLoanCreated(positionId, sharedLoanAddress);

        return sharedLoanAddress;
    }

    /**
     * This contract should not loans, but if it does, then disallow a loan increase by reverting.
     */
    function marginLoanIncreased(
        address,
        bytes32,
        uint256
    )
        external
        onlyMargin
        returns (address)
    {
        revert();
    }
}
