pragma solidity 0.4.19;

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { Math } from "zeppelin-solidity/contracts/math/Math.sol";
import { ReentrancyGuard } from "zeppelin-solidity/contracts/ReentrancyGuard.sol";
import { MathHelpers } from "../../lib/MathHelpers.sol";
import { TokenInteract } from "../../lib/TokenInteract.sol";
import { ShortCustodian } from "./interfaces/ShortCustodian.sol";
import { ShortSell } from "../ShortSell.sol";
import { ShortSellCommon } from "../impl/ShortSellCommon.sol";
import { ShortSellHelper } from "./lib/ShortSellHelper.sol";
import { Vault } from "../Vault.sol";


/**
 * @title DutchAuctionCloser
 * @author dYdX
 */
 /* solium-disable-next-line */
contract DutchAuctionCloser is
    ReentrancyGuard,
    TokenInteract {
    using SafeMath for uint256;

    // -----------------------------
    // ------ State Variables ------
    // -----------------------------

    address SHORT_SELL;

    address VAULT;

    // --------------------
    // ------ Events ------
    // --------------------

    event CloseAllApproval(
        address indexed _owner,
        address indexed _approved,
        bool _isApproved
    );

    // -------------------------
    // ------ Constructor ------
    // -------------------------

    function DutchAuctionCloser(
        address _shortSell
    )
        public
    {
        SHORT_SELL = _shortSell;
        VAULT = ShortSell(SHORT_SELL).VAULT();
    }

    // ----------------------------------------
    // ---- Public State Chaning functions ----
    // ----------------------------------------

    /**
     * Allows anyone to close a called short, Dutch-Auction style. The short must be past half of
     * its callTimeLimit and the paid price of the underlyingTokens starts at 0 at that point and
     * linearly increases to the amount of baseToken in the vault for the shortId. The short-seller
     * will be granted the difference between the price and the total baseToken in the vault.
     *
     * @param  shortId  Unique ID of the short
     * @return Amount of baseToken that the auction bidder recieved for fully closing the short
     */
    function closeShort(
        bytes32 shortId
    )
        nonReentrant
        external
        returns (uint256 _bidPrice)
    {
        // get short
        ShortSellCommon.Short memory short = ShortSellHelper.getShort(SHORT_SELL, shortId);

        // get initial base tokens
        uint256 vaultBaseToken = Vault(VAULT).balances(shortId, short.baseToken);
        uint256 myBaseTokenInitial = balanceOf(short.baseToken, address(this));

        // validate auction timing and get bidPrice
        uint256 bidPrice = getBidPriceInternal(short, vaultBaseToken);

        // get underlyingToken to pay
        uint256 underlyingTokenAmount = short.shortAmount.sub(short.closedAmount);

        // take tokens from msg.sender and close the short
        transferFrom(
            short.underlyingToken,
            msg.sender,
            address(this),
            underlyingTokenAmount);
        ShortSell(SHORT_SELL).closeShortDirectly(shortId, underlyingTokenAmount);

        // check receipt of the correct amount of baseToken
        assert(balanceOf(short.baseToken, address(this)).sub(myBaseTokenInitial) >= vaultBaseToken);

        // pay baseToken to the auction bidder
        transfer(short.baseToken, msg.sender, bidPrice);

        // pay baseToken back to short owner
        address deedHolder = ShortCustodian(short.seller).getShortSellDeedHolder(shortId);
        transfer(short.baseToken, deedHolder, vaultBaseToken.sub(bidPrice));

        return bidPrice;
    }

    // -----------------------------------
    // ---- Public Constant functions ----
    // -----------------------------------

    /**
     * Provided as a utility to see the current bidPrice of a short. Useful for frontends to call to
     * allow auction closers to see if they need
     *
     * @param  shortId  Unique ID of the short
     * @return Amount of baseToken that the auction bidder will recieve for fully closing the short
     */
    function getBidPrice(
        bytes32 shortId
    )
        view
        external
        returns (uint256 _bidPrice)
    {
        ShortSellCommon.Short memory short = ShortSellHelper.getShort(SHORT_SELL, shortId);
        uint256 vaultBaseToken = Vault(VAULT).balances(shortId, short.baseToken);
        return getBidPriceInternal(short, vaultBaseToken);
    }

    // -----------------------------------
    // ---- Internal Helper functions ----
    // -----------------------------------

    function getBidPriceInternal(
        ShortSellCommon.Short memory short,
        uint256 maxPrice
    )
        view
        private
        returns(uint256 _bidPrice)
    {
        uint256 callTimestamp = uint256(short.callTimestamp);
        uint256 callTimeLimit = uint256(short.callTimeLimit);
        require(callTimestamp > 0);

        uint256 auctionStartTimestamp = callTimestamp.add(callTimeLimit.div(2));
        uint256 auctionEndTimestamp = callTimestamp.add(callTimeLimit);
        require(block.timestamp >= auctionStartTimestamp);

        return MathHelpers.getPartialAmount(
            block.timestamp.sub(auctionStartTimestamp), // time since auction start
            auctionEndTimestamp.sub(auctionStartTimestamp), // total auction length
            maxPrice);
    }
}
