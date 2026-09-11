# Networks and exact amounts

::: tip Proposed Contract
All operations use an explicitly validated network. All amounts are exact bigint zatoshis: `100_000_000n` is one ZEC.
:::

## Network identity and consensus context

`defineNetwork` accepts an identity, checked genesis hash, versioned parameter document bytes and `parametersFormat`. It returns an opaque `Network`. A display name alone cannot establish consensus parameters. `ConsensusContext` adds target height and branch ID; transaction and circuit versions must agree with it. There are no built-in activation schedules asserted here.

`blockHash` and `txId` check lowercase 64-character display hex without `0x`; wire order is a separate conversion. `accountIndex` accepts integers from 0 through 2^31−1, and `diversifierIndex` accepts bigint from 0 through 2^88−1. Heights, indices and versions are checked integers; uint64 protocol fields cannot be converted lossily to JavaScript numbers.

## Proposed implemented parameter format (G4 review pending)

For `parametersFormat: 'zcash-js-network/1'`, `parameters` is canonical UTF-8 JSON
with exactly these keys in order: `encoding`, `Overwinter`, `Sapling`, `Blossom`,
`Heartwood`, `Canopy`, `Nu5`, `Nu6`, `Nu6_1`, `Nu6_2`, `Nu6_3`. `encoding` is exactly
`"main"`, `"test"` or `"regtest"`; each upgrade is an explicit uint32 height or
`null` (unscheduled). Heights are nondecreasing, equal heights are allowed, and
all fields after the first null must be null. There are no default schedules.

Use literal ASCII keys/encoding strings, minimal unsigned decimal integers, and
only object delimiters, commas and colons: no whitespace, escapes, BOM or trailing
bytes. Unknown, duplicate, missing or reordered keys, noncanonical numbers, unsafe
integers and invalid UTF-8 reject. Encoding constants and branch selection come
from pinned `zcash_protocol 0.10.6`; arbitrary HRPs/branches and unstable upgrades
are unsupported. Registration must own the bytes and bind **all** outer definition
fields. The [complete grammar and lowering decision](../planning/network-parameters-decision.md)
is proposed and internally implemented; the public `defineNetwork` factory and
secure host registration are not implemented by this component.

## Amount handling

Use the root named export `parseZec(value: string): bigint` to convert decimal ZEC input to exact zatoshis: `parseZec("0.00125")` returns `125_000n`. It rejects scientific notation and more than 8 fractional digits, without floating-point parsing or arithmetic. `formatZec(zatoshis: bigint): string` formats exact zatoshis as decimal ZEC without floating-point arithmetic or scientific notation, omitting unnecessary trailing fractional zeros. Neither helper takes an options object. Use an explicit bigint codec for JSON.

Only balance deltas may be negative. Fees, payment amounts and balance buckets remain nonnegative with further protocol validation in Rust. `MemoInput` is either text or bytes, never both; validate its encoding, size and destination compatibility at the trust boundary.

<<< ./examples/networks.ts

The example takes synthetic fixture inputs from its caller; it contains no endpoint, genesis hash or wallet data.

::: info Requires Qualification
The exact `NetworkDefinition.parameters` schema is a G4 gate. No usable network fixture or live Ironwood activation is supplied. Unknown input fields reject; preserving unknown container fields for lossless codecs does not permit unsupported wallet behavior.
:::
