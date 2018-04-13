pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { ERC20 } from "zeppelin-solidity/contracts/token/ERC20/ERC20.sol";
import { LoanOfferingVerifier } from "../short/interfaces/LoanOfferingVerifier.sol";


contract TestSmartContractLender is LoanOfferingVerifier {
    bool SHOULD_ALLOW;

    function TestSmartContractLender(
        bool shouldAllow
    )
        public
    {
        SHOULD_ALLOW = shouldAllow;
    }

    function verifyLoanOffering(
        address[9],
        uint256[7],
        uint32[4],
        bytes32
    )
        external
        returns (bool)
    {
        return SHOULD_ALLOW;
    }

    function allow(
        address token,
        address spender,
        uint256 amount
    )
        external
        returns (bool)
    {
        return ERC20(token).approve(spender, amount);
    }
}
