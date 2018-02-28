pragma solidity 0.4.19;

import { ERC20 } from "zeppelin-solidity/contracts/token/ERC20/ERC20.sol";


contract SmartContractLender {
    bool shouldAllow;

    function SmartContractLender(
        bool _shouldAllow
    )
        public
    {
        shouldAllow = _shouldAllow;
    }

    function verifyLoanOffering(
        address[9],
        uint[9],
        uint32[2],
        bytes32
    )
        external
        view
        returns (bool _isValid)
    {
        return shouldAllow;
    }

    function allow(
        address token,
        address spender,
        uint amount
    )
        external
        returns (bool _success)
    {
        return ERC20(token).approve(spender, amount);
    }
}
