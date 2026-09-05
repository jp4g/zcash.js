# Networks and exact amounts

::: tip Proposed Contract
All operations use an explicitly validated network. All amounts are exact bigint zatoshis: `100_000_000n` is one ZEC.
:::

## Network identity and consensus context

`defineNetwork` accepts an identity, checked genesis hash, versioned parameter document bytes and `parametersFormat`. It returns an opaque `Network`. A display name alone cannot establish consensus parameters. `ConsensusContext` adds target height and branch ID; transaction and circuit versions must agree with it. There are no built-in activation schedules asserted here.

`blockHash` and `txId` check lowercase 64-character display hex without `0x`; wire order is a separate conversion. `accountIndex` accepts integers from 0 through 2^31−1, and `diversifierIndex` accepts bigint from 0 through 2^88−1. Heights, indices and versions are checked integers; uint64 protocol fields cannot be converted lossily to JavaScript numbers.

## Amount handling

Pass `125_000n` for 125,000 zatoshis. Do not multiply a floating-point ZEC input by 100 million and assume exactness. Applications must parse decimal input exactly, reject excess fractional precision and use an explicit bigint codec for JSON. No amount parsing/formatting helper is declared by this API.

Only balance deltas may be negative. Fees, payment amounts and balance buckets remain nonnegative with further protocol validation in Rust. `MemoInput` is either text or bytes, never both; validate its encoding, size and destination compatibility at the trust boundary.

<<< ./examples/networks.ts

The example takes synthetic fixture inputs from its caller; it contains no endpoint, genesis hash or wallet data.

::: info Requires Qualification
The exact `NetworkDefinition.parameters` schema is a G4 gate. No usable network fixture or live Ironwood activation is supplied. Unknown input fields reject; preserving unknown container fields for lossless codecs does not permit unsupported wallet behavior.
:::
