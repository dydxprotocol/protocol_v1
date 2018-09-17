pragma solidity 0.4.24;
pragma experimental "v0.5.0";


interface IMedianizer {
    function peek()
        external
        view
        returns (bytes32, bool);

    function read()
        external
        view
        returns (bytes32);
}
