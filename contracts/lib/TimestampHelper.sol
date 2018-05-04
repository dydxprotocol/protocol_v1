pragma solidity 0.4.23;
pragma experimental "v0.5.0";


/**
 * @title TimestampHelper
 * @author dYdX
 *
 * Helper to get block timestamps in other formats
 */
library TimestampHelper {
    function getBlockTimestamp32()
        internal
        view
        returns (uint32)
    {
        require(
            uint256(uint32(block.timestamp)) == block.timestamp,
            "TimestampHelper#getBlockTimestamp32: Block timestamp overflows a uint32"
        );

        return uint32(block.timestamp);
    }
}
