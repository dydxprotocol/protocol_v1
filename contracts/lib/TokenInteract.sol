pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { ERC20 } from "zeppelin-solidity/contracts/token/ERC20/ERC20.sol";


library TokenInteract {
    function balanceOf(
        address token,
        address owner
    )
        internal
        view
        returns (uint256)
    {
        return ERC20(token).balanceOf(owner);
    }

    function allowance(
        address token,
        address owner,
        address spender
    )
        internal
        view
        returns (uint256)
    {
        return ERC20(token).allowance(owner, spender);
    }

    function approve(
        address token,
        address spender,
        uint256 value
    )
        internal
    {
        require(ERC20(token).approve(spender, value));
    }

    function transfer(
        address token,
        address to,
        uint256 amount
    )
        internal
    {
        require(ERC20(token).transfer(to, amount));
    }

    function transferFrom(
        address token,
        address from,
        address to,
        uint256 amount
    )
        internal
    {
        require(ERC20(token).transferFrom(from, to, amount));
    }
}
