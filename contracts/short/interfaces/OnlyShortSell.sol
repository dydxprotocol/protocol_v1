pragma solidity 0.4.19;


/**
 * @title OnlyShortSell
 * @author dYdX
 *
 * Contract to store the address of the main ShortSell contract and trust only that address to call
 * certain functions.
 */
contract OnlyShortSell {

    // -----------------------
    // ------ Constants ------
    // -----------------------

    // address of the known and trusted ShortSell contract on the blockchain
    address public SHORT_SELL;

    // -------------------------
    // ------ Constructor ------
    // -------------------------

    function OnlyShortSell(
        address shortSell
    )
        public
    {
        SHORT_SELL = shortSell;
    }

    // ---------------------------
    // -------- Modifiers --------
    // ---------------------------

    modifier onlyShortSell()
    {
        require(msg.sender == SHORT_SELL);
        _;
    }
}
