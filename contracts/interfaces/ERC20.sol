pragma solidity 0.4.18;

// Token standard API
// https://github.com/ethereum/EIPs/issues/20

contract ERC20 {
    function totalSupply() view public returns (uint supply);
    function balanceOf( address who ) view public returns (uint value);
    function allowance( address owner, address spender ) view public returns (uint _allowance);
    function symbol() view public returns (string);
    function name() view public returns (string);
    function decimals() view public returns (uint8);

    function transfer( address to, uint value) public returns (bool ok);
    function transferFrom( address from, address to, uint value) public returns (bool ok);
    function approve( address spender, uint value ) public returns (bool ok);

    event Transfer( address indexed from, address indexed to, uint value);
    event Approval( address indexed owner, address indexed spender, uint value);
}
