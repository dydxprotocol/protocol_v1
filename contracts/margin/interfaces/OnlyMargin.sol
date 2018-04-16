pragma solidity 0.4.21;
pragma experimental "v0.5.0";


/**
 * @title OnlyMargin
 * @author dYdX
 *
 * Contract to store the address of the main Margin contract and trust only that address to call
 * certain functions.
 */
contract OnlyMargin {

    // ============ Constants ============

    // address of the known and trusted Margin contract on the blockchain
    address public DYDX_MARGIN;

    // ============ Constructor ============

    function OnlyMargin(
        address margin
    )
        public
    {
        DYDX_MARGIN = margin;
    }

    // ============ Modifiers ============

    modifier onlyMargin()
    {
        require(msg.sender == DYDX_MARGIN);
        _;
    }
}
