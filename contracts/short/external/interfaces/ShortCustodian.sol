pragma solidity 0.4.21;
pragma experimental "v0.5.0";


/**
 * @title ShortCustodian
 * @author dYdX
 */
 /* solium-disable-next-line */
contract ShortCustodian {

    /**
     * Function that is intended to be called by external contracts to see where to pay any fees or
     * tokens as a result of closing a short on behalf of another contract.
     *
     * @param  shortId      Unique ID of the short
     * @return              Address of the true owner of the short position
     */
    function getShortSellDeedHolder(
        bytes32 shortId
    )
        external
        view
        returns (address);
}
