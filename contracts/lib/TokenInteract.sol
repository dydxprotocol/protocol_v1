pragma solidity 0.4.18;

import { ERC20 } from "zeppelin-solidity/contracts/token/ERC20.sol";


contract TokenInteract {
    // Changes to state require at least 5000 gas
    uint16 constant public EXTERNAL_QUERY_GAS_LIMIT = 4999;

    function balanceOf(
        address token,
        address owner
    )
        internal
        view
        returns (uint _balance)
    {
        // Limit gas to prevent reentrancy
        // ?? Do I need to limit gas? compiler throws warning on limiting in view function
        return ERC20(token).balanceOf/*.gas(EXTERNAL_QUERY_GAS_LIMIT)*/(owner);
    }

    function setAllowance(
        address token,
        address spender,
        uint value
    )
        internal
    {
        assert(ERC20(token).approve(spender, value));
    }

    function transfer(
        address token,
        address to,
        uint amount
    )
        internal
    {
        assert(ERC20(token).transfer(to, amount));
    }
}
