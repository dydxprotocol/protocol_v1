pragma solidity 0.4.19;


/**
 * @title TermsContract
 * @author dYdX, based on Dharma
 */
interface TermsContract {

    /**
     * [calculateInterestFee description]
     * @param  startTimestamp epoch seconds when the loan was started
     * @param  endTimestamp epoch seconds at which debt is repaid
     * @param  amount the quantity borrowed
     * @param  parameters arbitrary parameters to specify the calculation
     * @return _interestOwed
     */
    function calculateInterestFee(
        uint32  startTimestamp,
        uint32  endTimestamp,
        uint256 amount,
        bytes32 parameters
    )
        external
        pure
        returns (uint256 _interestOwed);
}
