pragma solidity 0.4.24;
pragma experimental "v0.5.0";


contract ERC20 {
    function totalSupply()
        public
        view
        returns (uint);

    function balanceOf(
        address guy
    )
        public
        view
        returns (uint);

    function allowance(
        address src,
        address guy
    )
        public
        view
        returns (uint);

    function approve(
        address guy,
        uint wad
    )
        public
        returns (bool);

    function transfer(
        address dst,
        uint wad
    )
        public
        returns (bool);

    function transferFrom(
        address src,
        address dst,
        uint wad
    )
        public
        returns (bool);
}
