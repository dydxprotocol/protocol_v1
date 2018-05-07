pragma solidity 0.4.23;
pragma experimental "v0.5.0";

import { TokenInteract } from "../lib/TokenInteract.sol";


contract TestTokenInteract {
    function balanceOf(
        address token,
        address owner
    )
        external
        view
        returns (uint256)
    {
        return TokenInteract.balanceOf(token, owner);
    }

    function allowance(
        address token,
        address owner,
        address spender
    )
        external
        view
        returns (uint256)
    {
        return TokenInteract.allowance(token, owner, spender);
    }

    function approve(
        address token,
        address spender,
        uint256 amount
    )
        external
    {
        TokenInteract.approve(token, spender, amount);
    }

    function transfer(
        address token,
        address to,
        uint256 amount
    )
        external
    {
        TokenInteract.transfer(token, to, amount);
    }

    function transferFrom(
        address token,
        address from,
        address to,
        uint256 amount
    )
        external
    {
        TokenInteract.transferFrom(token, from, to, amount);
    }
}
