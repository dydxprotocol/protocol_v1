pragma solidity 0.4.15;

import '../interfaces/ERC20.sol';

contract TokenInteract {
    // Changes to state require at least 5000 gas
    uint16 constant public EXTERNAL_QUERY_GAS_LIMIT = 4999;

    function balanceOf(
        address token,
        address owner
    ) internal constant returns (
        uint _balance
    ) {
        // Limit gas to prevent reentrancy
        return ERC20(token).balanceOf.gas(EXTERNAL_QUERY_GAS_LIMIT)(owner);
    }

    function setAllowance(
        address token,
        address spender,
        uint value
    ) internal {
        assert(ERC20(token).approve(spender, value));
    }

    function transfer(
        address token,
        address to,
        uint amount
    ) internal {
        assert(ERC20(token).transfer(to, amount));
    }
}
