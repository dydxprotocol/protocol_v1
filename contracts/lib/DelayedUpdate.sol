pragma solidity 0.4.18;

import './SafeMath.sol';

contract DelayedUpdate is SafeMath {
    struct AddressUpdate {
        uint startTimestamp;
        address toAddress;
        bool exists;
    }

    struct UintUpdate {
        uint startTimestamp;
        uint toValue;
        bool exists;
    }

    event AddressUpdateSubmitted(
        address updater,
        address toAddress,
        bytes32 indexed id
    );

    event AddressUpdateConfirmed(
        address updater,
        address toAddress,
        bytes32 indexed id
    );

    event UintUpdateSubmitted(
        address updater,
        uint toValue,
        bytes32 indexed id
    );

    event UintUpdateConfirmed(
        address updater,
        uint toValue,
        bytes32 indexed id
    );

    mapping(bytes32 => AddressUpdate) pendingAddressUpdates;
    mapping(bytes32 => UintUpdate) pendingUintUpdates;

    uint public updateDelay;
    uint public updateExpiration;

    function DelayedUpdate(
        uint _updateDelay,
        uint _updateExpiration
    ) public {
        updateDelay = _updateDelay;
        updateExpiration = _updateExpiration;
    }

    modifier delayedAddressUpdate(bytes32 id, address toAddress) {
        AddressUpdate memory existingUpdate = pendingAddressUpdates[id];

        if (existingUpdate.exists) {
            // If the pending update is expired, add the new one replacing it
            if (
                block.timestamp >= add(
                    existingUpdate.startTimestamp,
                    add(updateDelay, updateExpiration)
                )
            ) {
                pendingAddressUpdates[id] = AddressUpdate({
                    startTimestamp: block.timestamp,
                    toAddress: toAddress,
                    exists: true
                });
            } else {
                // If the pending update is not expired, validate this update is the same
                // then do the update

                require(add(updateDelay, existingUpdate.startTimestamp) <= block.timestamp);
                require(toAddress == existingUpdate.toAddress);

                delete pendingAddressUpdates[id];

                AddressUpdateConfirmed(
                    msg.sender,
                    toAddress,
                    id
                );

                _;
                return;
            }
        } else {
            // If no pending update exists yet, add one, and do not move onto the modified function

            pendingAddressUpdates[id] = AddressUpdate({
                startTimestamp: block.timestamp,
                toAddress: toAddress,
                exists: true
            });

            AddressUpdateSubmitted(
                msg.sender,
                toAddress,
                id
            );

            return;
        }
    }

    function cancelAddressUpdate(bytes32 id) internal {
        delete pendingAddressUpdates[id];
    }

    // TODO FIX THIS
    modifier delayedUintUpdate(bytes32 id, uint toValue) {
        UintUpdate memory existingUpdate = pendingUintUpdates[id];
        if (existingUpdate.exists) {
            // If the pending update is expired, add the new one replacing it
            if (
                block.timestamp <= add(
                    existingUpdate.startTimestamp,
                    add(updateDelay, updateExpiration)
                )
            ) {
                require(add(updateDelay, existingUpdate.startTimestamp) <= block.timestamp);
                require(toValue == existingUpdate.toValue);

                delete pendingUintUpdates[id];

                UintUpdateConfirmed(
                    msg.sender,
                    toValue,
                    id
                );

                _;
            }
        }

        pendingUintUpdates[id] = UintUpdate({
            startTimestamp: block.timestamp,
            toValue: toValue,
            exists: true
        });

        UintUpdateSubmitted(
            msg.sender,
            toValue,
            id
        );

        return;
    }
}
