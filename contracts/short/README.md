# protocol/contracts/short/

Smart contracts for opening and closing short positions.

### external

The collection of “second-layer” contracts that are not officially part of the short protocol, but
we have developed as a reference implementation of how to write contracts that can help manage
shorts.

### impl/

The collection of smart contracts that are responsible for the logic of the short protocol. Many of
these contracts are implemented as public libraries (separate contracts on the blockchain) because
if they were in the same contract as ShortSell.sol, we would exceed the gascost of a whole Ethereum
block just to deploy the contract. Yes, the code is that large.

### interfaces/

The collection of contract interfaces that are required for external contracts to implement in order
to properly interact with the short protocol. For example interfaces that short owners or loan
owners must implement in their smart contracts to take control of the short positions.

### ShortSell.sol

The main contract for interfacing with the dYdX short protocol. All external functions for shorting
are in this contract. This contract doesn't hold any of the short sell state, but is authorized to
write to the contracts which hold state and transfer user funds.

### Vault.sol

The contract responsible for holding all ERC20 token funds and doing accounting. As a security
measure, accounts for tokens on a per-short basis based on shortId. Holds all token funds. Is
authorized to transfer user funds via the Proxy. Allows authorized contracts to withdraw funds.
