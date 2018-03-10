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
    ReentrancyGuard {
    using SafeMath for uint256;

    // ------------------------
    // -------- Events --------
    // ------------------------

    /**
     * A short was closed by this contract
     */
    event ShortClosedByDutchAuction(
        bytes32 indexed shortId,
        address indexed shortSeller,
        address indexed bidder,
        uint256 closeAmount,
        uint256 baseTokenForBidder,
        uint256 baseTokenForSeller
    );

    // -----------------------
    // ------- Structs -------
    // -----------------------

    struct DutchBidTx {
        uint256 bidPrice;
        uint256 closeAmount;
    }

    // -----------------------------
    // ------ State Variables ------
    // -----------------------------

    address SHORT_SELL;

    address VAULT;

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
    function closeShortDirectly(
        bytes32 shortId,
        uint256 requestedCloseAmount
    )
        nonReentrant
        external
        returns (
            uint256 _amountClosed,
            uint256 _baseTokenReceived
        )
    {
        // get short
        ShortSellCommon.Short memory short = ShortSellHelper.getShort(SHORT_SELL, shortId);

        // validate auction timing and get bidPrice
        DutchBidTx memory closeTx = parseDutchBidTx(shortId, short, requestedCloseAmount);

        // take tokens from msg.sender and close the short
        uint256 baseTokenReceived = closeShortInternal(
            shortId,
            short.underlyingToken,
            short.baseToken,
            closeTx
        );

        // pay baseToken back to short owner
        address deedHolder = ShortCustodian(short.seller).getShortSellDeedHolder(shortId);
        TokenInteract.transfer(short.baseToken, deedHolder, closeTx.bidPrice);

        // pay baseToken to the auction bidder
        uint256 baseTokenForBidder = baseTokenReceived.sub(closeTx.bidPrice);
        TokenInteract.transfer(short.baseToken, msg.sender, baseTokenForBidder);

        ShortClosedByDutchAuction(
            shortId,
            short.seller,
            msg.sender,
            closeTx.closeAmount,
            baseTokenForBidder,
            closeTx.bidPrice
        );

        return (closeTx.closeAmount, baseTokenForBidder);
    }

    // -----------------------------------
    // ---- Internal Helper functions ----
    // -----------------------------------

    function closeShortInternal(
        bytes32 shortId,
        address baseToken,
        address underlyingToken,
        DutchBidTx memory closeTx
    )
        private
        returns(uint256 _baseTokenReceived)
    {
        // remember how much baseToken this contract has before the short is taken out
        uint256 initialBaseToken = TokenInteract.balanceOf(baseToken, address(this));

        // take the underlying token from the msg.sender
        TokenInteract.transferFrom(
            underlyingToken,
            msg.sender,
            address(this),
            closeTx.closeAmount);

        // close the short directly using the underlying token
        bytes memory noData;
        var (
            /*uint256*/ amountClosed,
            /*uint256*/ baseTokenReceived,
            /*uint256   interestFeeAmount */
        ) = ShortSell(SHORT_SELL).closeShort(
            shortId,
            closeTx.closeAmount,
            address(0), // no exchange wrapper
            noData // no order bytes
        );

        uint256 finalBaseToken = TokenInteract.balanceOf(baseToken, address(this));

        // check receipt of the correct amount of baseToken
        assert(closeTx.bidPrice < baseTokenReceived);
        assert(closeTx.closeAmount == amountClosed);
        assert(finalBaseToken.sub(initialBaseToken) == baseTokenReceived);

        return baseTokenReceived;
    }

    function parseDutchBidTx(
        bytes32 shortId,
        ShortSellCommon.Short memory short,
        uint256 requestedCloseAmount
    )
        view
        private
        returns(DutchBidTx memory _bidTx)
    {
        uint256 maxCloseAmount = short.shortAmount.sub(short.closedAmount);
        uint256 closeAmount = Math.min256(requestedCloseAmount, maxCloseAmount);

        // get initial base tokens
        uint256 vaultBaseToken = Vault(VAULT).balances(shortId, short.baseToken);
        uint256 shortInterestFee = ShortSell(SHORT_SELL).getShortInterestFee(shortId);
        uint256 availableBaseTokenAmount = MathHelpers.getPartialAmount(
            closeAmount,
            maxCloseAmount,
            vaultBaseToken.sub(shortInterestFee));

        uint256 callTimestamp = uint256(short.callTimestamp);
        uint256 callTimeLimit = uint256(short.callTimeLimit);
        require(callTimestamp > 0);

        uint256 auctionStartTimestamp = callTimestamp.add(callTimeLimit.div(2));
        uint256 auctionEndTimestamp = callTimestamp.add(callTimeLimit);

        require(block.timestamp >= auctionStartTimestamp);
        require(block.timestamp < auctionEndTimestamp);

        // price starts at max at (callTimeLimit / 2) and linearly decreases until callTimeLimit
        uint256 bidPrice =
            availableBaseTokenAmount.sub(
                MathHelpers.getPartialAmount(
                    block.timestamp.sub(auctionStartTimestamp), // time since auction start
                    auctionEndTimestamp.sub(auctionStartTimestamp), // total auction length
                    availableBaseTokenAmount
                )
            );

        return DutchBidTx({
            bidPrice: bidPrice,
            closeAmount: closeAmount
        });
    }
}
