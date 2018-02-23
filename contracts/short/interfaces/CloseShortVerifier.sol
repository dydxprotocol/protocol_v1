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
     * closeShortDirectly() for the short position.

     * NOTE: If returning true, this contract must assume that ShortSell will either revert the
     * entire transaction or that the specified amount of the short position was successfully closed.
     *
     * NOTE: This can be used to tokenize short positions and distribute shares as ERC20 tokens.
     * Such a token would be burned for the closer in the amount called here.
     *
     * NOTE: This interface also enables more complex logic, even for a single seller. For example,
     * this function could require the block.timestamp to be at least some time, or the amount to
     * be at least some minimum denomination.
     *
     * @param _who      Address of the caller of the close function
     * @param _shortId  Id of the short being closed
     * @param _amount   Amount of the short being closed
     */
    function closeOnBehalfOf(
        address _who,
        bytes32 _shortId,
        uint256 _amount
    )
        external
        returns (bool _success);
}
