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

## Implemented subset

| Root value export | Contract and implementation | Executed behavioral coverage |
| --- | --- | --- |
| `parseZec(value: string): bigint` | Exact decimal-to-zatoshi arithmetic; at most eight fractional digits, no float conversion. Signed input supports balance deltas. | `tests/sdk/primitives.test.mjs`: known examples, huge amounts, 2,001 signed round trips, precision/coercion/notation rejection. |
| `formatZec(zatoshis: bigint): string` | Exact signed display, no exponent, unnecessary fractional zeros removed. | Same amount tests, including one zatoshi and values beyond the safe-number range. |
| `accountIndex`, `diversifierIndex` | Frozen integer bounds, no coercion/wrapping. | Both inclusive boundaries and out-of-range/type cases. |
| `txId`, `blockHash` | Lowercase, exactly 64 display hex characters; no byte reversal or normalization. | Wrong width, uppercase, prefix, newline and invalid characters reject. |
| `isZcashError(value: unknown): value is ZcashError` | Recognizes this module instance's errors using a private WeakSet; no foreign getters inspected. | Sanitized messages/stacks, foreign errors/lookalikes/proxies rejected. |
| `defineNetwork(args): Promise<Network>` | Real Rust-validated immutable descriptor, admitted by a private instance registry; bounded copied canonical parameters and cancellation. | `tests/sdk/network.test.mjs`: actual packed Node import, lazy single native initialization, no fetch, Sapling branch vector, input ownership, forged-instance rejection and cancellation. |
| `http(url, options): HttpTransport` | Lazy opaque transport with a real internal Fetch JSON-RPC 2.0 read engine. It has no public request method and currently no exported client that consumes it. | `tests/sdk/http.test.mjs`: serialization, IDs, policy validation/copying, exact response numbers, error/absence distinction, bounds, retries and cancellation. |

Only the associated `AccountIndex`, `DiversifierIndex`, `TxId`, `BlockHash`,
`ErrorCode`, `ErrorInfo`, `ZcashError`, `HttpTransport`, `TransportOptions`,
`Network`, `NetworkDefinition` and `Op` types
are re-exported. Types reference the frozen declaration directly; TypeScript emits
that declaration under `dist/docs/api` to preserve exact brands and optional error
attachments without maintaining a divergent copy. It has no runtime import edge.
The export map exposes the root and the Node-only `grpc-node` subpath; internal
files and unimplemented functions are not public subpaths. The existing API book and root README describe the earlier
specification deliverable; this document records the current executable subset.

The amount input grammar is an optional minus, one or more ASCII integer digits,
and an optional decimal point followed by one to eight digits. Leading zeros are
accepted and formatted canonically. Plus signs, whitespace, `.1`, `1.`, exponents
and precision beyond eight digits reject. The helpers do not claim protocol money
range validation or authorize negative payments; only balance deltas may be negative.

## Transport behavior and limits

The internal engine serializes JSON-RPC 2.0 POST requests with unique, monotonic
string IDs per transport; validates exact matching IDs and result/error exclusivity;
and rejects duplicate/unknown envelope keys. It accepts only an internal read-method
allowlist and primitive parameters; no broadcast path is implemented. Its presence
does not establish that any named RPC is deployed or suitable for a public DTO.
There is no automatic protocol downgrade, provider handshake, endpoint failover,
ambient cookie/authentication use, redirect following, or cache use.

The engine follows the [JSON-RPC 2.0 specification](https://www.jsonrpc.org/specification).
Its internal [RFC 8259](https://www.rfc-editor.org/rfc/rfc8259) parser retains numeric
lexemes as `JsonNumber` tokens until a DTO can check exact units and ranges. It does
not round JSON numbers through JavaScript `number`. Tests cover decimal/exponent
tokens, escaped strings and names, arrays/literals, malformed grammar and duplicate
keys. Nesting is limited to 64 containers, in addition to the response byte bound.
This is an internal protocol parser, not a new public bigint/transaction codec.

`readRetry.attempts` counts total attempts including the first; `1` means no retry.
Retries retain the original parameters and endpoint but use fresh IDs and headers.
Only network faults, timeouts and HTTP 408/429/500/502/503/504 are retryable. A valid
RPC error, including one carried by HTTP 500, is never automatically retried.
`-32601` maps to `METHOD_NOT_SUPPORTED`; other RPC failures remain sanitized
`TRANSPORT_ERROR`, never fabricated empty/not-found results. Non-JSON HTTP error
pages map to HTTP failures. This initial engine supports strict 2.0 envelopes only;
legacy node envelope/version interoperability requires a settled profile.

Each attempt's timeout includes header acquisition, fetch, streaming and decoding.
Positive safe-integer durations are supported without host timer overflow. Caller
abort also interrupts retry backoff. Actual streamed/decompressed bytes are counted;
oversized responses fail `RESOURCE_LIMIT`, invalid UTF-8/envelopes fail
`PROTOCOL_MISMATCH`. Resources are released on success/failure/abort. Foreign header
callbacks cannot be forcibly cancelled, but are no longer awaited after cancellation
or deadline, and a late completion cannot dispatch a request. Synchronous parsing
checks elapsed time afterward; like other JavaScript work, it cannot preempt the event
loop mid-call. Browser CORS remains an endpoint responsibility and is not qualified.

Error messages contain fixed SDK text with no endpoint, headers, foreign causes,
server messages/data or abort reasons. Invalid inputs map to `INVALID_ARGUMENT` /
`validation` / `correct-input`; transport errors retain their frozen error code,
stage, retryability and recovery fields. No secret/state attachment is produced in
this slice, and errors are not automatically logged.

## Executed validation

Validation environment: Node 26.8.1, npm 11.19.0; no runtime dependencies added.
Dependency pins and lock graph remain unchanged except root package metadata.

| Command | Result |
| --- | --- |
| `npm ci --offline --ignore-scripts --no-audit --no-fund` | Pass, 106 existing pinned development packages installed. |
| `npm run build` | Pass, ESM JavaScript and declarations emitted. |
| `node --test --test-isolation=none tests/sdk/*.test.mjs` | 23 pass, 0 fail, 1 local-socket skip (24 tests). |
| `node tests/sdk/consumer.test.mjs` | 2 pass: real packed-package installation/import/typecheck and browser bundle execution. |
| `npm run docs:typecheck` | Pass. |
| `npm run docs:check-recovery` | Pass, compile-only recovery checks; its historical “documentation-only” output does not describe this slice. |
| `npm run docs:build` | Pass; existing large-chunk advisory remains. |
| `git diff --check` | Pass. |

TDD red runs preceded implementation: five primitive failures; three parser
failures; seven transport failures plus the socket skip. Follow-up behavior tests
exposed HTTP-error mapping and mutable retry parameters before fixes; both pass.

`npm run test:sdk` is the portable build/test entry point. The explicit
`--test-isolation=none` invocation above is a Node 26 diagnostic run because this
sandbox suppresses nested runner output through socket-backed child pipes. Consumer
commands capture output using file descriptors and execute the real tools. The
consumer test packs with `npm pack --ignore-scripts`, installs the local tarball
offline with scripts disabled into a temporary directory, imports the built package,
and checks declarations in NodeNext and Bundler resolution. No publication occurs.

The browser check uses the existing pinned Vite toolchain to bundle the built ESM
entry and internal read engine, then executes synthetic reads in a JavaScript realm
with browser globals, no Node globals, and WASM access/code generation disabled.
This establishes browser-safe importing and execution of this subset, not actual
browser networking/CORS, OPFS, wallet or chain qualification.

The isolated local HTTP server harness is retained in `tests/sdk/http.test.mjs`.
`listen(0, '127.0.0.1')` failed with `EPERM` in this sandbox. Synthetic Fetch and
ReadableStream fault injection passed; real socket behavior is unverified here.
Coordinator rerun on a socket-permitted host:

```sh
npm run build
node --test --test-name-pattern="isolated HTTP" tests/sdk/http.test.mjs
```

## Remaining scope and next slice

`defineNetwork` requires an exact versioned consensus/encoding parameter document.
The [network chapter](../api/networks-amounts.md) and
[H1.1](../api/host-contract.md#h1-1-negotiation-before-authority) explicitly leave
that schema unresolved. A display identity and genesis hash cannot replace it.
No network constructor, fabricated opaque network, or unsupported-only client
will be exported to bypass this boundary. The
[public mapping](../api/host-mapping.md#host-only-transport-and-composition) also
identifies RPC methods as candidates, not a qualified provider profile.

Consequently, **`defineNetwork` and `createPublicClient` are not exported**. No
PublicClient method, network registration/handshake or chain DTO validation is
claimed implemented. The genesis/display-hash checker is a scalar primitive, not
consensus-parameter validation. The worker requested any separate approved schema;
none was supplied during this slice. This is a concrete specification prerequisite,
not a requirement to wait for whole issues #2/#3.

The next independent slice needs the exact approved parameter format and vectors,
plus the supported JSON-RPC wire profile, genesis-check method, and result/error
mapping. Then implement `defineNetwork` and source-backed public reads with tests for
wrong/malformed network identity, lazy handshake, coherent chain points and exact
DTO conversion. Preserve the frozen factory arguments and advertise only completed
methods/types; decide partial-client packaging explicitly instead of returning an
object falsely typed as the complete `PublicClient`.

All other frozen values remain unsupported/unexported, including `grpc`, light and
wallet factories, composition, address/viewing/PCZT APIs and signer factories.
Broadcast needs qualified txid derivation from exact transaction bytes; transaction
observation needs a settled coherent inclusion/reorg mapping. Neither has placeholders.
Wallet DB, scanning, signing/proving, secrets, custom cryptography, protocol codecs,
live providers and deployment/publication remain outside this worker's slice.

## Package-owned pure network codecs

`defineNetwork` uses the accepted handle-free Rust consensus codec in a single
package-owned ESM capsule. Importing the public root does not initialize WASM;
the first admitted call loads the local capsule and initializes one native module.
It creates no worker, native wallet handle or disposal obligation. The descriptor
retains the caller's exact canonical parameters privately; neither identity nor
genesis alone establishes network equality. Caller parameters are copied before
any await, limited to256bytes; identity labels are limited to1024code units.
Cancellation is checked at async boundaries; pure synchronous native validation
finishes within its call. No mutable runtime URL or fetch supplies executable bytes.

`src/runtime/primitive-capsule.json` records the accepted native receipt, every
primitive artifact hash, the closed executable module set, generator and lockfile
hashes and emitted capsule hash. `scripts/primitive-capsule.mjs --generate
VERIFIED_NATIVE_BUILD` reproduces this selected asset from verified bytes using
the existing locked bundler. Ordinary package builds only hash-check and copy the
committed capsule and declarations; they need no local native artifact/build tools.
This narrow host-local codec qualification does not claim the H1 configurable
artifact-runtime contract, threaded scanning or any unimplemented client factory.

Private LightClient codec capsules now package the accepted Lightwire and
transparent-address Rust artifacts using the same offline capsule producer.
`lightwire-capsule.mjs` and `transparent-address-capsule.mjs` each expose an internal
`initialize()` returning the existing codec interface; import does not instantiate
WASM, and repeated initialization reuses the stateless instance. Reproduce with
`node scripts/primitive-capsule.mjs --generate-lightwire BUILD` or
`--generate-transparent-address BUILD`. Normal builds verify the committed hashes
and copy the capsules without fetching or building native code. This adds no
public client factory; packed Node codec tests are not browser acceptance.
