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
import { MathHelpers } from "../../../lib/MathHelpers.sol";
import { PositionGetters } from "../../impl/PositionGetters.sol";
import { BucketLender } from "./BucketLender.sol";


/**
 * @title BucketLenderReader
 * @author dYdX
 *
 * Read-only contract to read the state of BucketLenders
 */
contract BucketLender {
    using SafeMath for uint256;

    /**
     * [rebalanceBucketsAndGetLenderSummary description]
     *
     * NOTE: Not a constant function, but not intended to ever be part of a transaction. Designed to
     * be run as part of a call().
     *
     * @param  bucketLender  Address of the bucketLender contract to query
     * @param  lender        Address of the lender
     * @param  startBucket   Number of the lowest bucket to check (usually 0)
     * @return endBucket     Number of the highest bucket to check
     */
    function rebalanceBucketsAndGetLenderSummary(
        address bucketLender,
        address lender,
        uint256 startBucket
        uint256 endBucket
    )
        external
        returns (uint256 available, uint256 locked, uint256[] buckets)
    {
        BucketLender(bucketLender).rebalanceBuckets();
        (available, locked) = getLenderSummary(
            bucketLender,
            lender,
            startBucket,
            endBucket
        );
    }

    /**
     * [getLenderSummary description]
     *
     * @param  bucketLender  Address of the bucketLender contract to query
     * @param  lender        Address of the lender
     * @param  startBucket   Number of the lowest bucket to check (usually 0)
     * @return endBucket     Number of the highest bucket to check
     */
    function getLenderSummary(
        address bucketLender,
        address lender,
        uint256 startBucket
        uint256 endBucket
    )
        public
        view
        returns (uint256 available, uint256 locked, uint256[] buckets)
    {
        require(
            startBucket <= endBucket,
            "BucketLenderReader#getLenderSummary: endBucket must be greater than startBucket"
        );
        address margin = BucketLender(bucketLender).DYDX_MARGIN;
        bytes32 positionId = BucketLender(bucketLender).POSITION_ID;
        uint256 principal = Margin(margin).getPositionPrincipal(positionId);
        uint256 positionOwedAmount = principal == 0 ? 0 : Margin(margin).getPositionOwedAmount(positionId);
        uint256 lockedBucket = 0;
        if (principal != 0 && BucketLender(bucketLender).criticalBucket() == BucketLender(bucketLender).getCurrentBucket()) {
            lockedBucket = BucketLender(bucketLender).criticalBucket();
        }

        // keep track of which buckets actually have stuff
        uint256 bucketsToReturn = 0;
        uint256[] tempBuckets = new uint256[](endBucket.sub(startBucket).add(1));

        for (uint256 bucket = startBucket; bucket <= endBucket; bucket++) {
            uint256 (bucketAvailable, bucketLocked) = getBucketSummary(
                bucketLender,
                lender,
                bucket,
                principal,
                positionOwedAmount,
                lockedBucket > 0 ? bucket == lockedBucket : false,
            );
            available = available.add(bucketAvailable);
            locked = locked.add(bucketLocked);

            if (bucketAvailable != 0 || bucketLocked != 0) {
                tempBuckets[bucketsToReturn] = bucket;
                bucketsToReturn = bucketsToReturn.add(1);
            }
        }

        // copy tempBuckets to buckets
        buckets = new uint256[](bucketsToReturn);
        for (int i = 0; i < bucketsToReturn; i++) {
            buckets[i] = tempBuckets[i];
        }
    }

    /**
     * [getBucketSummary description]
     *
     * @param  bucketLender    Address of the bucketLender contract to query
     * @param  lender          Address of the lender
     * @param  bucket          Number of the bucket to check
     * @param  principal       Principal of the position
     * @param  owedAmount      Principal plus interest owed
     * @param  isLockedBucket  True if the bucket is both the CurrentBucket and the CriticalBucket
     */
    function getBucketSummary(
        address bucketLender,
        address lender,
        uint256 bucket,
        uint256 principal,
        uint256 positionOwedAmount,
        bool isLockedBucket,
    )
        internal
        view
        returns (uint256 available, uint256 locked)
    {
        uint256 principalForBucket = BucketLender(bucketLender).principalForBucket(i);
        uint256 availableForBucket = BucketLender(bucketLender).availableForBucket(i);
        uint256 weightForBucket = BucketLender(bucketLender).weightForBucket(i);
        uint256 weight = BucketLender(bucketLender).weightForBucketForAccount(i, lender);

        // calculate the locked amount for this bucket
        if (principal == 0) {
            // position is closed
            require(
                principalForBucket == 0,
                "getBucketSummary#getLenderSummary: Position is closed but not rebalanced"
            );
            locked = 0;
        } else {
            // position is not closed
            uint256 lockedForBucket = MathHelpers.getPartialAmount(
                principal,
                positionOwedAmount,
                principalForBucket
            );
            locked = MathHelpers.getPartialAmount(
                weight,
                weightForBucket,
                lockedForBucket
            );
        }

        // calculate the available amount for this bucket
        available = MathHelpers.getPartialAmount(
            weight,
            weightForBucket,
            availableForBucket
        );

        // If this is the CriticalBucket AND the CurrentBucket, then funds are not withdrawable
        if (isLockedBucket) {
            locked = locked.add(available);
            available = 0;
        }
    }
}
