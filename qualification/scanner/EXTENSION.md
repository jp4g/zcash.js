# Portable scanner extension

The six `cases::run_case` cases execute the real migrated SQLite WalletDb. Native
runs compare cached scanning with public inline scanning; generated WASM calls
only inline scanning and unchanged `put_blocks`. Both compare immutable native
observations in `references/`, captured once after native parity. The original
`fixtures/` bytes have not changed. Common stays 1.0.0 on the pinned wallet graph.

| Case | Required real effects |
| --- | --- |
| transparent | Separate UTXO receipt, parsed V6 spend, both raw-row idempotent; public requests and frozen SQL |
| effects-trees | Sapling and Ironwood V3 receipts/spends/change; full canonical SQL, roots, seven checkpoints, four retained IDs, receipt/change witness paths, requests |
| imported-batches | Real migration and spending UFVK import; four native-equivalent batch states/requests, including isolated Ironwood receipt; final trees |
| failures | Typed hash/height/commitment encoding failures, wrapper identity guard, truncated protobuf; unchanged raw rows |
| rollback | Sapling and Ironwood conflicting frontiers; typed commit errors/ranges, no partial rows; correct-frontier recovery |
| rewind | Actual returned height determines suffix; complete native-replayed canonical SQL and original roots/checkpoints/witnesses/requests |

The supplemental header regression supplies a genuine parsed header with a forged
predecessor while raw `prev_hash` matches the initial frontier and prior metadata
is absent. This reproduced a real commit before the guard. The bounded wrapper
now rejects **every nonempty header** before scanning; it supports headerless
compact envelopes only. The `failures` case executes this assertion in WASM too,
without altering the frozen reference JSON. This is not a production header policy.

Native scan-complete is observable only after `scan_cached_blocks` returns from
commit. Inline scan-start, scan-complete, and commit-complete are distinct observed
boundaries; failed inline commits must omit commit-complete. No scheduling failure
has been reproduced and no upstream wallet/tree algorithm is patched.

Each build creates a new exclusive `scratch/bundles/STAGE` directory, copies the
source before compiling, records measured F1 input hashes, and hashes generated
assets in `web/manifest.json`. Old `replay-web` and closed bundles are retained.
Hash, label, finite deadline, and exclusive evidence guards remain active under
Python optimization. A failed stage is retained; use a new label for each command.

From the repository root:

```sh
python3 qualification/scanner/run.py UNIQUE-native 300 cargo test --offline --locked -- --test-threads=1 --nocapture
python3 qualification/scanner/run.py UNIQUE-controls 30 python3 test_guards.py
python3 qualification/scanner/run.py UNIQUE-js-controls 30 node replay/test-extension.mjs
python3 qualification/scanner/run.py UNIQUE-integrity 60 python3 -O check.py
python3 qualification/scanner/run.py UNIQUE-build 600 python3 build-wasm.py --stage UNIQUE-stage
```

Use the resulting **exact** `web` path and manifest SHA256 for replay:

```sh
python3 qualification/scanner/run.py UNIQUE-node 420 node /ABS/BUNDLE/web/node.mjs MANIFEST_SHA256
node /ABS/BUNDLE/web/run-firefox.mjs --artifacts /ABS/BUNDLE/web --manifest-sha256 MANIFEST_SHA256 --logs /ABS/NEW_LOG_DIRECTORY --scratch /home/jack/zcash-scanner-scratch --geckodriver /snap/bin/geckodriver
```

The Firefox command runs in the coordinator foreground outside this worker
sandbox. Packaged geckodriver chooses Firefox; no binary or security override is
supplied. The suite requires a secure, nonisolated page/worker with no SAB. It
subscribes to actual WebDriver BiDi realm events and checks the full worker script
URL, owner realm, created/destroyed order, and empty live worker inventory after
each case. A page termination request alone cannot pass. Node worker exits are
independently observed; Web-in-Node is never reported as Firefox evidence.

For the separate threaded worker, reuse `scanner_case(name, on_stage)` from the
same Rust library/features/lock and `replay/case-entry.mjs::executeCase` with that
worker's actual generated bindings. Bootstrap and await its own shared runtime
and thread pool before calling the entry. Pass the immutable reference object and
relay stages. `case-contract.mjs` validates the case result. The successful
unshared loader/host is not a shared-runtime implementation. Preserve a separately
hashed shared build and independently observe each browser worker's destruction.

Scope remains synthetic and ephemeral: no proof or consensus validity, Orchard
receipt/spend qualification, durable storage, request servicing, send/outbox,
provider, production SDK or gate claim. Empty blocks do not qualify a pool.
Threaded parity remains independently required before any full F2 claim.

Threaded handoff cross-check: its `Domain.start()` prepares the owner, starts two
compute workers on the same compiled module/shared memory, waits for both generated
initializations, then calls `owner_build()` and admits operations after readiness.
The scanner owner must call that runtime's `assert_ready()` before this entry;
SQLite connection/account/scan/commit ownership stays on the owner worker. Scanner
failure after readiness invalidates the domain, without fallback mutation replay.
Each closed shared run must observe destruction of owner and both compute realms.

The current `scanner_case` deliberately selects `Mode::Inline`. Calling it inside
a ready shared domain would prove shared-runtime **inline** parity only. Actual
cached scanner scheduling on WASM is still unexecuted: `Mode::NativeReference` is
currently native-only, and a separate tested owner operation must enable the real
`scan_cached_blocks` path after pool readiness. Do not equate a surrounding
`parallel_evidence()` probe with scanner compute execution. Preserve the frozen
per-case native results and compare both operations. Rust cases are public through
the rlib; retain the scanner's local backend/SQLite/PCZT patch identities when
composing a consuming workspace, since dependency manifests' patches do not
propagate to that workspace. This documents the remaining integration, not an
unexecuted implementation or a claim about the threaded worker's coverage.
