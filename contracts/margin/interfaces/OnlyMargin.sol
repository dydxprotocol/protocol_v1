pragma solidity 0.4.23;
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

    // Address of the known and trusted Margin contract on the blockchain
    address public DYDX_MARGIN;

    // ============ Constructor ============

    constructor(
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
