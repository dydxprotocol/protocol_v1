pragma solidity 0.4.18;

import "zeppelin-solidity/contracts/ownership/Ownable.sol";
import "../../lib/DelayedUpdate.sol";
import "./ShortSellState.sol";


/**
 * @title ShortSellAdmin
 * @author Antonio Juliano
 *
 * This contract contains the owner only admin functions of ShortSell
 */
contract ShortSellAdmin is Ownable, DelayedUpdate, ShortSellState {
    // --------------------------------
    // ----- Owner Only Functions -----
    // --------------------------------

    function updateTrader(
        address _trader
    )
        onlyOwner // Must come before delayedAddressUpdate
        delayedAddressUpdate("TRADER", _trader)
        external
    {
        TRADER = _trader;
    }

    function updateProxy(
        address _proxy
    )
        onlyOwner // Must come before delayedAddressUpdate
        delayedAddressUpdate("PROXY", _proxy)
        external
    {
        PROXY = _proxy;
    }

    function updateVault(
        address _vault
    )
        onlyOwner // Must come before delayedAddressUpdate
        delayedAddressUpdate("VAULT", _vault)
        external
    {
        VAULT = _vault;
    }

    function updateRepo(
        address _repo
    )
        onlyOwner // Must come before delayedAddressUpdate
        delayedAddressUpdate("REPO", _repo)
        external
    {
        REPO = _repo;
    }

    function updateAuctionRepo(
        address _auction_repo
    )
        onlyOwner // Must come before delayedAddressUpdate
        delayedAddressUpdate("AUCTION_REPO", _auction_repo)
        external
    {
        AUCTION_REPO = _auction_repo;
    }
}
