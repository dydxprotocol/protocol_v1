pragma solidity 0.4.19;

/**
 * @title AddressDatabase
 * @author dYdX
 */
 /* solium-disable-next-line */
contract AddressDatabase {
    /**
     * Function that is intended to be called by external contracts to see if the database contains
     * a certain address.
     *
     * @param  who  Address to be inquired about
     * @return true if the address is contained in the database, false otherwise
     */
    function hasAddress(
        address who
    )
        external
        view
        returns (bool);
}
