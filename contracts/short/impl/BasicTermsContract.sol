pragma solidity 0.4.19;


import { TermsContract } from "../interfaces/TermsContract.sol";
/**
 * @title TermsContract
 * @author dYdX, based on Dharma
 */
contract BasicTermsContract is TermsContract {

    function calculateInterestFee(
        uint32  startTimestamp,
        uint32  endTimestamp,
        uint256 amount,
        bytes32 parameters
    )
        pure
        external
        returns (uint256 _interestOwed)
    {
        return 100;
    }
}
