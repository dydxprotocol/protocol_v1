pragma solidity 0.4.24;
pragma experimental "v0.5.0";


interface ERC20 {
    function totalSupply()
        external
        view
        returns (uint);

    function balanceOf(
        address guy
    )
        external
        view
        returns (uint);

    function allowance(
        address src,
        address guy
    )
        external
        view
        returns (uint);

    function approve(
        address guy,
        uint wad
    )
        external
        returns (bool);

    function transfer(
        address dst,
        uint wad
    )
        external
        returns (bool);

    function transferFrom(
        address src,
        address dst,
        uint wad
    )
        external
        returns (bool);
}
