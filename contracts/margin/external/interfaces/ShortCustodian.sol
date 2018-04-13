pragma solidity 0.4.21;
pragma experimental "v0.5.0";


/**
 * @title ShortCustodian
 * @author dYdX
 *
 * Interface to interact with other second-layer contracts. For contracts that own short sell
 * positions as a proxy for other addresses.
 */
 /* solium-disable-next-line */
contract ShortCustodian {

    /**
     * Function that is intended to be called by external contracts to see where to pay any fees or
     * tokens as a result of closing a short on behalf of another contract.
     *
     * @param  marginId     Unique ID of the short
     * @return              Address of the true owner of the short position
     */
    function getMarginDeedHolder(
        bytes32 marginId
    )
        external
        view
        returns (address);
}
