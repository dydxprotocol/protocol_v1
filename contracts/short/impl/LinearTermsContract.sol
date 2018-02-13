pragma solidity 0.4.19;


import { TermsContract } from "../interfaces/TermsContract.sol";
import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { MathHelpers } from "../../lib/MathHelpers.sol";

/**
 * @title TermsContract
 * @author dYdX, based on Dharma
 */
contract LinearTermsContract is TermsContract {
    using SafeMath for uint256;

    function calculateInterestFee(
        uint256 startTimestamp,
        uint256 endTimestamp,
        uint256 closeShortAmount,
        uint256 totalShortAmount,
        uint256 parameters
    )
        external
        pure
        returns (uint256 _interestOwed)
    {
        uint timeElapsed = endTimestamp.sub(startTimestamp);

        // interestRate = parameters * (closeShortAmount / totalShortAmount);
        // return interestRate * (timeElapsed / 1 day);
        return closeShortAmount.mul(parameters).mul(timeElapsed).div(totalShortAmount).div(1 days);
    }
}
