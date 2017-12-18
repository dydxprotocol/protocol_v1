pragma solidity 0.4.18;

import "zeppelin-solidity/contracts/ownership/NoOwner.sol";
import "../lib/AccessControlled.sol";


/**
 * @title ShortSellRepo
 * @author Antonio Juliano
 *
 * This contract is used to store state for short sells
 */
contract ShortSellAuctionRepo is AccessControlled, NoOwner {
    // -----------------------
    // ------- Structs -------
    // -----------------------

    struct AuctionOffer {
        uint offer;
        address bidder;
        bool exists;
    }
    // ---------------------------
    // ----- State Variables -----
    // ---------------------------

    // Mapping that contains all short sells. Mapped by: shortId -> Short
    mapping(bytes32 => AuctionOffer) public auctionOffers;

    // -------------------------
    // ------ Constructor ------
    // -------------------------

    function ShortSellAuctionRepo(
        uint _accessDelay,
        uint _gracePeriod
    )
        public
        AccessControlled(_accessDelay, _gracePeriod)
    {}

    // --------------------------------------------------
    // ---- Authorized Only State Changing Functions ----
    // --------------------------------------------------

    function setAuctionOffer(
        bytes32 shortId,
        uint offer,
        address bidder
    )
        requiresAuthorization
        external
    {
        auctionOffers[shortId] = AuctionOffer({
            offer: offer,
            bidder: bidder,
            exists: true
        });
    }

    function deleteAuctionOffer(
        bytes32 shortId
    )
        requiresAuthorization
        external
    {
        delete auctionOffers[shortId];
    }

    // -------------------------------------
    // ----- Public Constant Functions -----
    // -------------------------------------

    function getAuction(
        bytes32 shortId
    )
        view
        public
        returns (
            uint _offer,
            address _bidder
        )
    {
        AuctionOffer memory auctionOffer = auctionOffers[shortId];

        return (
            auctionOffer.offer,
            auctionOffer.bidder
        );
    }

    function containsAuction(
        bytes32 shortId
    )
        view
        public
        returns (bool exists)
    {
        return auctionOffers[shortId].exists;
    }
}
