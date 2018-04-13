pragma solidity 0.4.21;
pragma experimental "v0.5.0";


/**
 * @title PositionCustodian
 * @author dYdX
 *
 * Interface to interact with other second-layer contracts. For contracts that own margin
 * positions as a proxy for other addresses.
 */
 /* solium-disable-next-line */
contract PositionCustodian {

    /**
     * Function that is intended to be called by external contracts to see where to pay any fees or
     * tokens as a result of closing a margin position on behalf of another contract.
     *
     * @param  marginId      Unique ID of the margin position
     * @return               Address of the true owner of the margin position
     */
    function getPositionDeedHolder(
        bytes32 marginId
    )
        external
        view
        returns (address);
}
