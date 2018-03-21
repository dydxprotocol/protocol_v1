pragma solidity 0.4.19;

import { ShortOwner } from "./ShortOwner.sol";


/**
 * @title CloseShortDelegator
 * @author dYdX
 *
 * Interface that smart contracts must implement in order to let other addresses close a short
 * owned by the smart contract.
 */
contract CloseShortDelegator is ShortOwner {

    // -------------------------
    // ------ Constructor ------
    // -------------------------

    function CloseShortDelegator(
        address shortSell
    )
        public
        ShortOwner(shortSell)
    {
    }

    // ----------------------------------------
    // ------ Public Interface functions ------
    // ----------------------------------------

    /**
     * Function a contract must implement in order to let other addresses call closeShort() for the
     * short position. This allows short sellers to use more complex
     * logic to control their short positions. For example, this can be used to tokenize short
     * positions and distribute shares as ERC20 tokens. Such a token would be burned for the closer
     * in the amount called here. This interface also allows for regulatory compliance; it could
     * require the block.timestamp to be at least some time, or the amount to be at least some
     * minimum denomination.
     *
     * NOTE: If returning non-zero, this contract must assume that ShortSell will either revert the
     * entire transaction or that the specified amount of the short position was successfully
     * closed. Returning 0 will indicate an error and cause ShortSell to throw.
     *
     * @param closer           Address of the caller of the close function
     * @param payoutRecipient  Address of the recipient of any base tokens paid out
     * @param shortId          Id of the short being closed
     * @param requestedAmount  Amount of the short being closed
     * @return allowedAmount   The amount the user is allowed to close for the specified short
     */
    function closeOnBehalfOf(
        address closer,
        address payoutRecipient,
        bytes32 shortId,
        uint256 requestedAmount
    )
        onlyShortSell
        external
        returns (uint256 allowedAmount);
}
