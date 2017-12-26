pragma solidity 0.4.18;

import "./SafeMath.sol";


/**
 * @title DelayedUpdate
 * @author Antonio Juliano
 *
 * Allows for timelocked updates on address and uint fields
 */
contract DelayedUpdate is SafeMath {
    // -----------------------
    // ------- Structs -------
    // -----------------------

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

    // ---------------------------
    // ----- State Variables -----
    // ---------------------------

    mapping(bytes32 => AddressUpdate) pendingAddressUpdates;
    mapping(bytes32 => UintUpdate) pendingUintUpdates;

    uint public updateDelay;
    uint public updateExpiration;

    // ------------------------
    // -------- Events --------
    // ------------------------

    event AddressUpdateSubmitted(
        address updater,
        address toAddress,
        bytes32 indexed id,
        uint timestamp
    );

    event AddressUpdateConfirmed(
        address updater,
        address toAddress,
        bytes32 indexed id,
        uint timestamp
    );

    event AddressUpdateCanceled(
        address toAddress,
        bytes32 indexed id,
        uint timestamp
    );

    event UintUpdateSubmitted(
        address updater,
        uint toValue,
        bytes32 indexed id,
        uint timestamp
    );

    event UintUpdateConfirmed(
        address updater,
        uint toValue,
        bytes32 indexed id,
        uint timestamp
    );

    event UintUpdateCanceled(
        uint toValue,
        bytes32 indexed id,
        uint timestamp
    );

    // -------------------------
    // ------ Constructor ------
    // -------------------------

    function DelayedUpdate(
        uint _updateDelay,
        uint _updateExpiration
    )
        public
    {
        updateDelay = _updateDelay;
        updateExpiration = _updateExpiration;
    }

    // ---------------------------
    // -------- Modifiers --------
    // ---------------------------

    /**
     * Timelock an address update. Will pass on control to the modified function only if the
     * same update has been submitted and the required delay has passed.
     * NOTE (!!!): This modifier has no access control. If you want access control, use another
     *             access control modifier (!!) BEFORE (!!) this one
     *
     * @param   id          Unique id for this update. Must use a different one for each different
     *                      update. i.e. use "PROXY" to update the proxy variable
     * @param   toAddress   Address to update the variable to
     */
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
                    id,
                    block.timestamp
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
                id,
                block.timestamp
            );

            return;
        }
    }

    /**
     * Timelock a uint update. Will pass on control to the modified function only if the
     * same update has been submitted and the required delay has passed.
     * NOTE (!!!): This modifier has no access control. If you want access control, use another
     *             access control modifier (!!) BEFORE (!!) this one
     *
     * @param   id          Unique id for this update. Must use a different one for each different
     *                      update. i.e. use "PROXY" to update the proxy variable
     * @param   toValue     Uint to update the variable to
     */
    modifier delayedUintUpdate(bytes32 id, uint toValue) {
        UintUpdate memory existingUpdate = pendingUintUpdates[id];

        if (existingUpdate.exists) {
            // If the pending update is expired, add the new one replacing it
            if (
                block.timestamp >= add(
                    existingUpdate.startTimestamp,
                    add(updateDelay, updateExpiration)
                )
            ) {
                pendingUintUpdates[id] = UintUpdate({
                    startTimestamp: block.timestamp,
                    toValue: toValue,
                    exists: true
                });
            } else {
                // If the pending update is not expired, validate this update is the same
                // then do the update

                require(add(updateDelay, existingUpdate.startTimestamp) <= block.timestamp);
                require(toValue == existingUpdate.toValue);

                delete pendingUintUpdates[id];

                UintUpdateConfirmed(
                    msg.sender,
                    toValue,
                    id,
                    block.timestamp
                );

                _;
                return;
            }
        } else {
            // If no pending update exists yet, add one, and do not move onto the modified function

            pendingUintUpdates[id] = UintUpdate({
                startTimestamp: block.timestamp,
                toValue: toValue,
                exists: true
            });

            UintUpdateSubmitted(
                msg.sender,
                toValue,
                id,
                block.timestamp
            );

            return;
        }
    }

    // -----------------------------------------
    // --- Internal State Changing Functions ---
    // -----------------------------------------

    /**
     * Cancel a pending address update. If you want to provide this functionality on your contract,
     * you must provide a public function (probably with access control) which calls this
     *
     * @param id    Id of the update to cancel
     */
    function cancelAddressUpdate(bytes32 id) internal {
        AddressUpdate memory update = pendingAddressUpdates[id];
        require(update.exists);

        AddressUpdateCanceled(
            update.toAddress,
            id,
            block.timestamp
        );

        delete pendingAddressUpdates[id];
    }

    /**
     * Cancel a pending uint update. If you want to provide this functionality on your contract,
     * you must provide a public function (probably with access control) which calls this
     *
     * @param id    Id of the update to cancel
     */
    function cancelUintUpdate(bytes32 id) internal {
        UintUpdate memory update = pendingUintUpdates[id];
        require(update.exists);

        UintUpdateCanceled(
            update.toValue,
            id,
            block.timestamp
        );

        delete pendingUintUpdates[id];
    }
}
