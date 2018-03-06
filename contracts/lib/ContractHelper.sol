pragma solidity 0.4.19;


/**
 * @title ContractHelper
 * @author dYdX
 *
 * Tell if an address is a contract or not.
 * From: stackoverflow.com/questions/37644395/how-to-find-out-if-an-ethereum-address-is-a-contract
 */
library ContractHelper {
    function isContract(
        address addr
    )
        view
        internal
        returns (bool)
    {
        uint size;
        assembly { size := extcodesize(addr) } // solium-disable-line security/no-inline-assembly
        return size > 0;
    }
}
