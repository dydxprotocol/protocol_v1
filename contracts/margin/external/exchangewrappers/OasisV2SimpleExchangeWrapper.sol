/*

    Copyright 2018 dYdX Trading Inc.

    Licensed under the Apache License, Version 2.0 (the "License");
    you may not use this file except in compliance with the License.
    You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

    Unless required by applicable law or agreed to in writing, software
    distributed under the License is distributed on an "AS IS" BASIS,
    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
    See the License for the specific language governing permissions and
    limitations under the License.

*/

pragma solidity 0.4.24;
pragma experimental "v0.5.0";

import { SafeMath } from "openzeppelin-solidity/contracts/math/SafeMath.sol";
import { ISimpleMarketV1 } from "../../../external/Maker/Oasis/ISimpleMarketV1.sol";
import { AdvancedTokenInteract } from "../../../lib/AdvancedTokenInteract.sol";
import { MathHelpers } from "../../../lib/MathHelpers.sol";
import { TokenInteract } from "../../../lib/TokenInteract.sol";
import { ExchangeReader } from "../../interfaces/ExchangeReader.sol";
import { ExchangeWrapper } from "../../interfaces/ExchangeWrapper.sol";


/**
 * @title OasisV2SimpleExchangeWrapper
 * @author dYdX
 *
 * dYdX ExchangeWrapper to interface with Maker's (Oasis exchange) SimpleMarket or MatchingMarket
 * contracts to trade using a specific offer. Since any MatchingMarket is also a SimpleMarket, this
 * ExchangeWrapper can also be used for any MatchingMarket.
 */
contract OasisV2SimpleExchangeWrapper is
    ExchangeWrapper,
    ExchangeReader
{
    using SafeMath for uint256;
    using TokenInteract for address;
    using AdvancedTokenInteract for address;

    // ============ Structs ============

    struct Offer {
        uint256 makerAmount;
        address makerToken;
        uint256 takerAmount;
        address takerToken;
    }

    // ============ State Variables ============

    address public SIMPLE_MARKET;

    // ============ Constructor ============

    constructor(
        address simpleMarket
    )
        public
    {
        SIMPLE_MARKET = simpleMarket;
    }

    // ============ Public Functions ============

    function exchange(
        address /*tradeOriginator*/,
        address receiver,
        address makerToken,
        address takerToken,
        uint256 requestedFillAmount,
        bytes orderData
    )
        external
        returns (uint256)
    {
        ISimpleMarketV1 market = ISimpleMarketV1(SIMPLE_MARKET);
        uint256 offerId = bytesToOfferId(orderData);
        Offer memory offer = getOffer(market, offerId);

        // make sure offer is for the correct tokens
        verifyOfferTokens(offer, makerToken, takerToken);

        // calculate maximum amount of makerToken to receive given requestedFillAmount
        uint256 makerAmount = getInversePartialAmount(
            offer.takerAmount,
            offer.makerAmount,
            requestedFillAmount
        );

        // make sure offer is fillable
        verifyOfferAmount(offer, makerAmount);

        // make sure that the exchange can take the tokens from this contract
        takerToken.ensureAllowance(address(market), requestedFillAmount);

        // do the exchange. take() is either successful or reverts
        assert(makerAmount == uint128(makerAmount));
        market.take(bytes32(offerId), uint128(makerAmount));

        // set allowance for the receiver
        makerToken.ensureAllowance(receiver, makerAmount);

        return makerAmount;
    }

    function getExchangeCost(
        address makerToken,
        address takerToken,
        uint256 desiredMakerToken,
        bytes orderData
    )
        external
        view
        returns (uint256)
    {
        ISimpleMarketV1 market = ISimpleMarketV1(SIMPLE_MARKET);
        Offer memory offer = getOffer(market, bytesToOfferId(orderData));
        verifyOfferTokens(offer, makerToken, takerToken);
        verifyOfferAmount(offer, desiredMakerToken);

        // return takerToken cost of desiredMakerToken
        return MathHelpers.getPartialAmount(
            desiredMakerToken,
            offer.makerAmount,
            offer.takerAmount
        );
    }

    function getMaxMakerAmount(
        address makerToken,
        address takerToken,
        bytes orderData
    )
        external
        view
        returns (uint256)
    {
        ISimpleMarketV1 market = ISimpleMarketV1(SIMPLE_MARKET);
        Offer memory offer = getOffer(market, bytesToOfferId(orderData));
        verifyOfferTokens(offer, makerToken, takerToken);

        return offer.makerAmount;
    }

    // ============ Private Functions ============

    /**
     * Calculate the greatest target amount that can be passed into getPartialAmount such that a
     * certain result is achieved.
     *
     * @param  numerator    The numerator of the getPartialAmount function
     * @param  denominator  The denominator of the getPartialAmount function
     * @param  result       The result of the getPartialAmount function
     * @return              The largest value of target such that the result is achieved
     */
    function getInversePartialAmount(
        uint256 numerator,
        uint256 denominator,
        uint256 result
    )
        private
        pure
        returns (uint256)
    {
        uint256 temp = result.add(1).mul(denominator);
        uint256 target = temp.div(numerator);

        if (target.mul(numerator) == temp) {
            target = target.sub(1);
        }

        return target;
    }

    function getOffer(
        ISimpleMarketV1 market,
        uint256 offerId
    )
        private
        view
        returns (Offer memory)
    {
        (
            uint256 makerAmount,
            address makerToken,
            uint256 takerAmount,
            address takerToken
        ) = market.getOffer(offerId);

        return Offer({
            makerAmount: makerAmount,
            makerToken: makerToken,
            takerAmount: takerAmount,
            takerToken: takerToken
        });
    }

    function verifyOfferTokens(
        Offer memory offer,
        address makerToken,
        address takerToken
    )
        private
        pure
    {
        require(
            offer.makerToken != address(0),
            "OasisV2SimpleExchangeWrapper#verifyOfferTokens: offer does not exist"
        );
        require(
            makerToken == offer.makerToken,
            "OasisV2SimpleExchangeWrapper#verifyOfferTokens: makerToken mismatch"
        );
        require(
            takerToken == offer.takerToken,
            "OasisV2SimpleExchangeWrapper#verifyOfferTokens: takerToken mismatch"
        );
    }

    function verifyOfferAmount(
        Offer memory offer,
        uint256 fillAmount
    )
        private
        pure
    {
        require(
            fillAmount != 0,
            "OasisV2SimpleExchangeWrapper#verifyOfferAmount: cannot trade zero makerAmount"
        );
        require(
            fillAmount <= offer.makerAmount,
            "OasisV2SimpleExchangeWrapper#verifyOfferAmount: offer is not large enough"
        );
        uint256 spend = MathHelpers.getPartialAmount(
            fillAmount,
            offer.makerAmount,
            offer.takerAmount
        );
        require(
            spend != 0,
            "OasisV2SimpleExchangeWrapper#verifyOfferAmount: cannot trade zero takerAmount"
        );
    }

    function bytesToOfferId(
        bytes orderData
    )
        private
        pure
        returns (uint256)
    {
        require(
            orderData.length == 32,
            "OasisV2SimpleExchangeWrapper:#bytesToOfferId: invalid orderData"
        );

        uint256 offerId;

        /* solium-disable-next-line security/no-inline-assembly */
        assembly {
            offerId := mload(add(orderData, 32))
        }

        return offerId;
    }
}
