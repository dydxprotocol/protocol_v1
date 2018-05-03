pragma solidity 0.4.23;
pragma experimental "v0.5.0";

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { HasNoContracts } from "zeppelin-solidity/contracts/ownership/HasNoContracts.sol";
import { HasNoEther } from "zeppelin-solidity/contracts/ownership/HasNoEther.sol";
import { TokenInteract } from "../../../lib/TokenInteract.sol";
import { ExchangeWrapper } from "../../interfaces/ExchangeWrapper.sol";
import { OnlyMargin } from "../../interfaces/OnlyMargin.sol";


/**
 * @title OpenDirectlyExchangeWrapper
 * @author dYdX
 *
 * dYdX ExchangeWrapper to open a position by borrowing the owedToken instead of atomically selling
 * it. This requires the trader to put up the entire collateral themselves.
 */
contract OpenDirectlyExchangeWrapper is
    HasNoEther,
    HasNoContracts,
    OnlyMargin,
    ExchangeWrapper
{
    using SafeMath for uint256;

    struct StartingBalances {
        uint256 takerTokenBalance;
        uint256 makerTokenBalance;
        uint256 takerFeeTokenBalance;
    }

    address public DYDX_PROXY;

    constructor(
        address margin,
        address dydxProxy
    )
        public
        OnlyMargin(margin)
    {
        DYDX_PROXY = dydxProxy;
    }

    // ============ Margin-Only Functions ============

    function exchange(
        address makerToken,
        address takerToken,
        address tradeOriginator,
        uint256 requestedFillAmount,
        bytes orderData
    )
        external
        onlyMargin
        returns (uint256)
    {
        assert(TokenInteract.balanceOf(takerToken, address(this)) >= requestedFillAmount);
        assert(requestedFillAmount > 0);

        TokenInteract.transfer(takerToken, tradeOriginator, requestedFillAmount);

        return 0;
    }

    function exchangeForAmount(
        address, /* makerToken */
        address, /* takerToken */
        address, /* tradeOriginator */
        uint256, /* desiredMakerToken */
        bytes /* orderData */
    )
        external
        onlyMargin
        returns (uint256)
    {
        revert();
    }

    // ============ Public Constant Functions ============

    function getTradeMakerTokenAmount(
        address, /* makerToken */
        address, /* takerToken */
        uint256, /* requestedFillAmount */
        bytes /* orderData */
    )
        external
        view
        returns (uint256)
    {
        return 0;
    }

    function getTakerTokenPrice(
        address, /* makerToken */
        address, /* takerToken */
        uint256, /* desiredMakerToken */
        bytes /* orderData */
    )
        external
        view
        returns (uint256)
    {
        revert();
    }
}
