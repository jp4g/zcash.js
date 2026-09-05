# Receive addresses

::: tip Proposed Contract
Use explicit account IDs. `current` reads and returns a string or null; it never allocates. `next` and `at` persist exposure before returning an `AddressRecord`.
:::

<<< ./examples/receive.ts

## Default and explicit receivers

Omitting `request`, or using `{ format: 'unified' }`, includes/requires every available supported receiver on the account. This links those receivers and permits transparent receipt. The example instead explicitly omits transparent receipt and requires both shielded receivers. Missing required receivers fail without fallback.

A custom unified request must require at least one of Sapling or Ironwood. Transparent-only uses `{ format: 'transparent' }`; it is not a unified address. `receiverTypes` describes encodings, while `intendedPools` describes use. The `orchard` receiver is reused for Ironwood; it does not add legacy Orchard to `Pool`.

## Indexes and exposure

`addresses.list` returns issued records. `at` writes at an exact checked diversifier index and cannot search forward. Changing receivers at an exposed index can fail `ADDRESS_ALREADY_EXPOSED`. Transparent child-index/discovery ranges constrain what is safe to recover; arbitrary indices can fail `DISCOVERY_RANGE_UNSAFE`.

Standalone `addresses.derive` is exact-index derivation; `find` searches from an index with explicit `maxAttempts` for valid diversifiers. Neither registers wallet exposure. `decode` retains known receivers and unknown typecodes; `selectReceiver` needs an explicit pool and consensus context. Parsing unknown container items does not authorize unsupported routing.

For stakeholder review, decide which receiver disclosures the receive screen explains before it displays or shares the address. Do not put generated addresses in logs or telemetry.
