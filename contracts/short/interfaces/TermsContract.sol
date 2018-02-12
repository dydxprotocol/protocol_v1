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
     * @param  closeShortAmount the quantity of the short to be calculated for
     * @param  totalShortAmount the total quantity of the short
     * @param  parameters arbitrary parameters to specify the calculation
     * @return _interestOwed
     */
    function calculateInterestFee(
        uint256 startTimestamp,
        uint256 endTimestamp,
        uint256 closeShortAmount,
        uint256 totalShortAmount,
        uint256 parameters
    )
        external
        pure // not enforcable
        noInvalidTimestamp(startTimestamp)
        returns (uint256 _interestOwed);

    modifier noInvalidTimestamp(uint256 timestamp) {
        require(timestamp != 0);
        _;
    }
}
