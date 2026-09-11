# G4 network parameter document decision

Status: **proposed implemented specification, pending independent HIGH review**.
Bounded prerequisite under existing #4, feeding #6. No public API signature change,
new public export, complete `defineNetwork` factory, or G4 acceptance is claimed.

## Decision

Select `zcash-js-network/1` in the existing outer `parametersFormat` field.
`parameters` is canonical UTF-8 JSON containing exactly these ordered keys:

```text
encoding, Overwinter, Sapling, Blossom, Heartwood, Canopy,
Nu5, Nu6, Nu6_1, Nu6_2, Nu6_3
```

The first value is exactly `"main"`, `"test"`, or `"regtest"`. Every remaining
value is `null` or an unsigned decimal integer in `[0, 4294967295]`. Integers use
`0` or a nonzero digit followed by zero or more digits; no sign, decimal point,
exponent, or leading zeros. Keys and encoding values are literal ASCII with no
escapes. The document has exactly one object, commas and colons as shown below,
no whitespace, BOM, or trailing bytes. There is no final newline.

```json
{"encoding":"regtest","Overwinter":0,"Sapling":0,"Blossom":0,"Heartwood":0,"Canopy":0,"Nu5":0,"Nu6":0,"Nu6_1":0,"Nu6_2":0,"Nu6_3":0}
```

This is a **synthetic all-at-zero schedule**, not a deployed-network fixture.
All ten fields are required. Scheduled heights must be nondecreasing; equal
heights are valid. After the first `null`, every later value must be `null`.
All-null is valid. Null means unscheduled, not “use the upstream default.”
Unknown, duplicate, missing or reordered keys, invalid UTF-8, escaped spellings,
noncanonical numbers (including negative zero), unsafe integers, and unsupported
outer format identifiers reject. `encoding` only chooses the protocol encoding
family; it never supplies activation defaults or establishes chain identity.
No arbitrary HRPs, branch assignments, NU7 or Tachyon fields are supported.

This flat grammar is sufficient for the two methods on the pinned `Parameters`
trait. It avoids a redundant inner version or identity and requires no general
canonical-JSON dependency. JS decodes, validates and reconstructs in known order,
then compares canonical text; fatal UTF-8 decoding preserves BOM for rejection.
Rust consumes the exact literal grammar and checked u32 values independently.
Neither Rust memory layout nor a Serde representation defines these public bytes.

## Source and lowering

The selected consumer/scanner lock is authoritative: **zcash_protocol 0.10.6**,
librustzcash commit `28cf1143f932dae94d8626fc0d26a6c61b08823c`,
[consensus.rs](https://github.com/zcash/librustzcash/blob/28cf1143f932dae94d8626fc0d26a6c61b08823c/components/zcash_protocol/src/consensus.rs).
`Parameters::network_type` receives the encoding selector, and
`activation_height` receives exactly the ten explicit optional heights.
`is_nu_active` and `BranchId::for_height` are the actual upstream implementations.
When upgrades share a height, the last one in upstream order selects the branch.
Before any activation, the upstream branch observation is Sprout; that observation
is not a promise of Sprout transaction or wallet support.

The sealed blanket `NetworkConstants` implementation supplies all twelve encoding
constants. No JS production branch-ID or encoding-constant table is introduced.
The test golden records are emitted by this exact crate, and tests compare every
constant, all upgrade slots and branch boundaries. Synthetic schedules deliberately
do not use main/test marker schedules. There is no live activation claim.

Common remains 1.0.0 at libraries commit
`f4526b0fa86406589732c8fb3849855fb92c43a2`; the wallet reference remains
`a9142ee100b3a563b7d9ba7a8e94201d00ad8154`. The wallet's original 0.10.4 lock is
not the selected consumer 0.10.6 lock. The private qualification crate only needs
protocol 0.10.6 and the already installed wasm-bindgen 0.2.128. Its narrow lock
uses the same versions/checksums as the consumer; it does not migrate or reproduce
the full Common/wallet graph, and leaves those existing lockfiles untouched.

The separately selected node reference is Zakura v1.4.0 commit
`1e36d1bb6a8a9778a1bd316704b9c8cb75182de6`. Its internal network serialization
collapses custom parameters to kind and is unsuitable as this document format.
No node schedule compatibility or wire-runtime acceptance is inferred from that
source selection. Completed source research was consumed, not repeated.

## Ownership, equality and integration boundary

`src/network-parameters.ts` is internal. Parsing copies input bytes with
`new Uint8Array(input)` (including Buffer inputs), freezes the decoded schedule,
and returns a fresh copy on every bytes access. No mutable byte view is retained
from the caller or exposed to consumers.

`bindNetworkDefinition` snapshots the existing four fields, checks a nonempty
string identity and the existing lowercase display genesis hash rule, rejects
unknown own fields, and validates the exact format and document. Identity is
preserved verbatim without case or Unicode normalization. Its equality key is a
JSON tuple of **identity, genesisHash, parametersFormat, canonical document text**.
This avoids delimiter ambiguity and binds every field; it is neither a hash,
authentication evidence, host handle, nor a registry. Same display identity with
changed genesis or parameters must not reuse this key. Different encoding families
remain different registrations even where some upstream prefixes coincide.

The Rust `Document` owns its bytes and optional heights, exposes no mutators and
implements the actual `Parameters` trait. Its private qualification bridge returns
JSON observations solely to compare native/WASM behavior. That observation JSON
is not the production host ABI and is not part of `zcash-js-network/1`.

The eventual async `defineNetwork(NetworkDefinition & Op)` still needs the verified
asset loader, selected production host ABI, per-boundary Rust validation, registration
ownership and opaque `Network` construction. Cancellation belongs to that factory;
this internal synchronous helper accepts only `NetworkDefinition`, not `Op`.
Do not cast its result to `Network` or expose it as a complete factory.
No root exports/configuration or other owners' code changed.

No settled public behavior or light-client genesis requirement is relaxed. A
light protocol/context observation remains insufficient to establish genesis
equality. Client source-profile implementation and qualification stay separate.
Independent HIGH review must accept this proposed format before G4 approval;
any requested change to settled public behavior requires an explicit decision.

## Evidence and remaining acceptance

See repository file `qualification/network-parameters/REPORT.md` for actual
commands, native/Node/Firefox outcomes, source coordinates and limitations.
The component qualifies synthetic format lowering and encoding/branch observations.
It does not qualify live networks, clients, wallet operations, transactions, proving,
SQLite, production registration or secure loading. There is no blanket whole-#2
waiting gate for this independently executable component.
