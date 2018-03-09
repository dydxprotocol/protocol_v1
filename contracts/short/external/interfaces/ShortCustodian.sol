pragma solidity 0.4.19;

/**
 * @title ShortCustodian
 * @author dYdX
 */
 /* solium-disable-next-line */
contract ShortCustodian {
    function getShortSellDeedHolder(
        bytes32 shortId
    )
        external
        view
        returns (address _deedHolder);
}
