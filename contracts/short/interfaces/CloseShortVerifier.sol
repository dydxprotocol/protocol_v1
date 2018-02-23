pragma solidity 0.4.19;


/**
 * @title CloseShortVerifier
 * @author dYdX
 *
 * Interface that smart contracts must implement to be able to make off-chain generated
 * loan offerings
 */
contract CloseShortVerifier {

    /**
     * Function a contracts must implement in order to let other accounts call closeShort() or
     * closeShortDirectly() for the short position. This allows short sellers to use more complex
     * logic to control their short positions. For example, this can be used to tokenize short
     * positions and distribute shares as ERC20 tokens. Such a token would be burned for the closer
     * in the amount called here. This interface also allows for regulatory compliance; it could
     * require the block.timestamp to be at least some time, or the amount to be at least some
     * minimum denomination.
     *
     * NOTE: If returning non-zero, this contract must assume that ShortSell will either revert the
     * entire transaction or that the specified amount of the short position was successfully closed.
     *
     * @param _who              Address of the caller of the close function
     * @param _shortId          Id of the short being closed
     * @param _requestedAmount  Amount of the short being closed
     * @return _allowedAmount   The amount the user is allowed to close for the specified short
     */
    function closeOnBehalfOf(
        address _who,
        bytes32 _shortId,
        uint256 _requestedAmount
    )
        external
        returns (uint256 _allowedAmount);
}
