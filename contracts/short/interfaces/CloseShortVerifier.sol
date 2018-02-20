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
     * Function a TokenizedShort must implement in order for holders of the token to be able to
     * close the short position. If the function doesn't throw, the contract must assume that the
     * user was able to successfully close their position.
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
