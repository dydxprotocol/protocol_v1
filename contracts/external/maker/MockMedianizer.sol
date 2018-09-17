pragma solidity 0.4.24;
pragma experimental "v0.5.0";


contract MockMedianizer {
    bool private has;
    bytes32 private val;

    function peek()
        external
        view
        returns (bytes32, bool)
    {
        return (val, has);
    }

    function read()
        external
        view
        returns (bytes32)
    {
        assert(has);
        return val;
    }

    function poke(
        bytes32 wut
    )
        external
        // auth
    {
        val = wut;
        has = true;
    }

    function void()
        external
        // auth
    {
        has = false;
    }
}
