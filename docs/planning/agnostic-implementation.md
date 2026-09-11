# Initial WASM-independent implementation

Owner sequencing amendment, 2026-09-11: production code demonstrably independent
of WASM qualification proceeds alongside issues #2/#3. Wallet, storage, scanning,
signing and proving remain gated. This owned slice does not change qualification
files or the global execution ledger. Independent HIGH review and LOW fixes follow
implementation; this worker does not perform final approval or publication.

The private package is `zcash.js` version `0.0.0`, with one ESM root entry point.
Only implemented values will be exported there; the complete frozen declaration
is not the runtime export surface. Existing API-book examples remain specification
examples. No release, provider interoperability or wallet support is claimed.

Build with `npm run build`; execute behavioral tests with `npm run test:sdk`.
Node's built-in test runner and the existing pinned TypeScript 6.0.3 are sufficient.
The existing VitePress pin, scripts and dependency graph are preserved. Dependencies
were installed using `npm ci --offline --ignore-scripts --no-audit --no-fund`.

## Current boundary

Implementation is in progress. Amounts, checked scalar identifiers, host errors
and bounded HTTP JSON-RPC are independent of the wallet module.

`defineNetwork` requires an exact versioned consensus/encoding parameter document.
The [network chapter](../api/networks-amounts.md) and
[H1.1](../api/host-contract.md#h1-1-negotiation-before-authority) explicitly leave
that schema unresolved. A display identity and genesis hash cannot replace it.
No network constructor, fabricated opaque network, or unsupported-only client
will be exported to bypass this boundary. The
[public mapping](../api/host-mapping.md#host-only-transport-and-composition) also
identifies RPC methods as candidates, not a qualified provider profile.
