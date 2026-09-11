# Internal verified executable primitive loader

`src/runtime/primitive-loader.ts` adds `openPrimitive(artifact, options?)`, an
async internal component for the accepted checked private network/transaction
bindings. It uses the unchanged `acquireArtifacts`. There is no root export,
public `createRuntime`, H1 ABI negotiation, wallet, storage or authority service.
This scope is not complete issue #4/#8 or full transaction validation.

The only supported package is produced by private revision
`63d08edb99b1d88e4899c27e61cc955fca5e35d6`, using accepted Rust/generated packet
`acaf7069e466c82ce1be2c45ebafb75a92b59ee9` and metadata hash
`09ae852de689eb47fba35dfefaae81397d280f5c2542bccdee9747954efad575`.
The SDK pin binds the entire canonical manifest:
`49b8d1b68cb851c473c184bb7986842718d652cdd31995a47ae82bb23565499b`.
The manifest build digest is
`b6a930766ec48f2d3b669b7302ad97964eda3a41bd4edf0c1fad2019aac8af78`.
`tests/runtime-primitive-loader/pin.json` retains full paired identities.

The legal `zcash-artifact/1` manifest describes private contract
`zakura-private-primitive/1`, lowering `checked-bindgen-0.2.128/1`, baseline mode,
operations `{consensusContext:'1',decodeTransaction:'1'}`, network parameters
`zcash-js-network/1`, no host services, and `not-used` protobuf/database revisions.
Those last values explicitly represent absent services, not implemented methods.
This profile has no caller override or fallback to another backend.

All acquisition hashes must pass before execution. A second exact manifest-pin
check rejects changed/re-pinned entry code, worker code, imports, build identities
or inventories before any executable namespace or worker exists. It deliberately
supports one reviewed package rather than a general JavaScript import parser.
Private bundling closes the generated checked entry's imports and removes its
unused URL-fetch initialization path without patching generated glue.

Node creates a fresh mode-0700 temporary directory and mode-0600 verified module
and worker files, then starts the worker from those files. Browser creates owned
Blob URLs for those same verified bytes. The wrapper imports only the supplied
owned module URL and initializes WASM from an owned transferred byte copy.
Remote asset URLs are never used by dynamic import or WASM initialization.
Node's fixed native host imports are loader implementation dependencies, not
caller-supplied executable artifacts. Verified acquisition buffers are disposed
after dispatch; files/Blob URLs remain owned until terminal teardown.

The returned frozen object offers:

- `consensusContext(format, parameters, height, options?)`: copied 1–256 byte
  ordinary same-realm Uint8Array and uint32 height; result `{height,branchId}`.
- `decodeTransaction(raw, branch, options?)`: copied 1–2,097,152 byte ordinary
  same-realm Uint8Array and uint32 branch; result `{bytes,txid,display}` through
  real `Transaction::read/write/txid`. The wrapper retains accepted version,
  context, full consumption and byte-exact serialization checks.
- `close()`: one cached terminal Promise. Admission stops synchronously;
  Node completion awaits worker termination and file removal. Browser calls
  native terminate and revokes all owned URLs; that API alone cannot attest
  observed realm destruction, which the parent BiDi test must establish.

Both arrays in transaction results are independent mutable copies; the record is
frozen. Worker results have exact schemas, length/value bounds and display/txid
consistency checks. No WASM memory or caller buffer is transferred. Buffer and
subviews work; detached/foreign/shared backing stores and prototype spoofs reject.
One request is admitted per owner, with no queue/registry. Concurrent admission
returns RESOURCE_LIMIT. Multiple owners are independent; there is no global
worker budget. The 2 MiB input policy and deadlines are not proof of a hard engine
memory ceiling or a consensus maximum.

Options are exactly `{signal?,timeoutMs?}`. Signals use native same-realm branding
and captured hooks; shadow properties and synthetic abort events cannot defeat
native cancellation. Timeout is an integer 1–120,000 ms, default 30,000 ms, across
startup acquisition/import/readiness or the individual request. Startup/request
abort and timeout race work and permanently invalidate the admitted stateless
owner; no mutation is being rolled back. A request already aborted before
admission leaves an existing owner usable. Startup abort never creates an owner.
Late messages cannot revive a terminal domain. Worker loss, traps, invalid results
and unexpected transport failures require a fresh owner. Input/Rust Result errors
remain recoverable INVALID_ARGUMENT. Errors contain fixed SDK messages without
foreign causes. Teardown failure rejects the cached close Promise with a sanitized
error; it does not claim successful resource removal.

Validation performed here: production TypeScript build; 13 Node loader tests;
196 accepted network cases plus admissions; all 13 original transaction vectors,
208 adapter calls, 1,472 truncated prefixes, context/version/lossy controls,
snapshots and mutable result ownership; complete initial hash/extra-import
rejection before namespace creation; native abort/deadline/worker-loss/cleanup
controls. The unchanged acquisition suite passed 23 tests with one real HTTPS
case skipped. Private packaging passes three tests and two byte-identical builds.
Injected transport faults are not Rust behavior. A separate actual diagnostic
WASM unreachable trap after a real codec call proves the private wrapper's fatal
state; it does not prove a production Rust panic trigger or recovery.

Actual Node HTTPS and ordinary page-owned Firefox execution remain blocked here:
`listen EPERM: operation not permitted 127.0.0.1`. No Firefox was started. The
immutable parent package is
`/home/jack/zcash-primitive-loader-scratch/host-package-final-r3`, inventory digest
`2e812bbc0f32a3697aaaac80c1c2614f06046cc5cb5dc3ad5eda37b137f820e4`.
Its runner SHA256 is
`3629b380aa64a2b0878739d04a16cdf2a519537c6f0af4dceeaa52b3eba0bc89`.
Verify that runner digest before execution, then:

```sh
NODE_EXTRA_CA_CERTS=/home/jack/zcash-runtime-artifacts-scratch/fixture-ca.crt \
node /home/jack/zcash-primitive-loader-scratch/host-package-final-r3/host.mjs \
  2e812bbc0f32a3697aaaac80c1c2614f06046cc5cb5dc3ad5eda37b137f820e4
```

The runner authenticates every package byte, copies verified bytes into its own
namespace for native Node execution, serves the same snapshots via local HTTPS,
uses the approved read-only fixture CA/server leaf and NSS certutil, creates a
fresh local CA-trusting profile, and requires `acceptInsecureCerts:false`.
The existing leaf expires 2026-09-13 18:01:12 UTC; after expiry a new separately
approved valid fixture is required. No certificate or browser security bypass.

The page uses native realm constructors and calls the actual worker. Six native
HTTPS corruption/re-pinned-import fixtures must fail before any Blob/worker
creation. Native caller aborts and deadlines cover startup and requests; the
startup-abort fixture waits for an observed worker realm while holding its init
message. Deadline fixtures deliberately lose transport messages to real workers. Allowed CSP
is `default-src 'none'; script-src 'self' blob: 'wasm-unsafe-eval'; worker-src blob:;
connect-src 'self'; base-uri 'none'; object-src 'none'`. Separate cases deny workers
and WASM compilation. Failure must be observed truthfully. BiDi subscribes before
navigation and requires the exact Blob script URLs, page ownership, and observed
destruction before acknowledging close and permitting a replacement worker.
None of these browser/CSP/realm assertions have passed in this worker sandbox.

Reproduce the local non-socket SDK check (no package/config edits):

```sh
node /home/jack/zcash.js/node_modules/typescript/bin/tsc -p tsconfig.json \
  --outDir /home/jack/zcash-primitive-loader-scratch/sdk
node --test --test-isolation=none tests/runtime-primitive-loader/loader.test.mjs
```

Preparation accepts the selected private packet and a nonexistent output:
`node tests/runtime-primitive-loader/prepare.mjs PACKET OUTPUT`. It snapshots the
three needed SDK production sources plus frozen API types, compiles from those
snapshots using installed TypeScript, checks the accepted transaction corpus hash,
and records source fingerprints. The selected immutable package's exact compiled
loader also passed all 13 Node tests via `PRIMITIVE_SDK=.../host-package-final-r3`.

SDK changes are currently **uncommitted**: this environment denies Git's
`/home/jack/zcash.js/.git/worktrees/verified-primitive-loader/index.lock` as a
read-only filesystem despite the requested reservation. Provenance truthfully
records SDK base `cf1a82dc5c7ec4a0bcfc1d6997b372fbc201013b` plus exact source
hashes, not a fabricated SDK commit. The pre-existing untracked `node_modules`
symlink is not part of these changes. Parent must commit only the assigned new
loader/tests/document, independently review HIGH, run the immutable host package,
then decide paired integration. No push, merge or publication occurred.
