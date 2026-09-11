# F2 synthetic scanner foundation — partial qualification

Historical foundation report through e338313. See [EXTENSION.md](EXTENSION.md) for
the resumed implementation. Coordinator subsequently passed actual Node and
Firefox no-SAB first replay; the Chrome launch failure below is not a current
browser-wide blocker. Historical commands/hashes below are retained, not current
extension commands.

The native cached scanner and the public inline wrapper completed the frozen
nonempty corpus and produced equal canonical SQLite state. A real generated WASM
module replayed that corpus in a dedicated **unshared Node worker**, reached
`scan-complete` and `commit-complete`, and matched the native canonical snapshot.
No serial scheduling failure was reproduced, so no wallet or scheduler patch is
proposed. This foundation does **not** complete F2, F1, F3, or a production gate.

All implementation changes are under `qualification/scanner`. The wallet source,
other workers' directories, original caches and SDK were consulted read-only.
No live chain/provider, publication, deployment, funds, mining or deferred work
was performed. No push or merge was performed.

## Construction and graph

Wallet revision: `a9142ee100b3a563b7d9ba7a8e94201d00ad8154`. Backend/SQLite RC4 and
PCZT RC2 are patched to that checkout; every Zakura package version matches the
qualification consumer lock. Common remains exactly **1.0.0**, without duplicate
Zakura source identities. Both native and WASM use this directory's single lock.
The source identity difference from the registry-based consumer is explicit.

The preferred upstream TestBuilder probe could not resolve its uncached
`ambassador` dependency offline. The authorized `cargo fetch` failed DNS for
`index.crates.io`; no alternate network route was attempted. The uncompiled probe
and command are preserved in external logs. The implemented generator instead
uses genuine public Sapling `Note`/`sapling_note_encryption` and Ironwood V3
`Note`/`IronwoodNoteEncryption`. It does not implement any cryptography, private
wallet algorithm, tree algorithm, or mock wallet. Public incremental-tree append
constructs independent reference frontiers for root checks.

These are synthetic compact envelopes with real encrypted notes, synthetic hashes
and spends revealing the genuine note nullifiers. They are **not proof-verified
or consensus-valid blocks**. The transparent spending transaction is a synthetic
unsigned V6 transaction parsed by the genuine transaction decoder. No F4
signature, proof or consensus-validation claim follows.

Real setup calls `Connection::open_in_memory`, loads the array module, constructs
`WalletDb`, runs `WalletMigrator`, and creates the synthetic account. UFVK import
is separately executed. The fixed test clock and deterministic test RNG are fixture
inputs, not a production entropy design. Account UUIDs still come from the real
backend and are normalized only for cross-wallet/cross-target observations.

[Fixture manifest](fixtures/manifest.json) records activation parameters, the empty
predecessor frontiers/hash, synthetic seed/account, retention interval, block cases,
expected values and file hashes. [Canonical state](fixtures/native-reference.json),
[native replayed state](fixtures/native-replayed.json), [roots](fixtures/roots.json),
and [transparent state](fixtures/transparent-reference.json) are frozen results.

## Executed coverage and limits

| Criterion | Executed result | Limit |
| --- | --- | --- |
| Native liveness | Cached reference and inline wrapper return for 7 blocks; configured native Rayon cap 2; finite process watchdog | No per-task native worker instrumentation or performance claim |
| Sapling | Receipt 50000; spend; internal change 30000; irrelevant payment 20000; owned positions 0,1; one spend/nullifier association | One synthetic account and fixed scope cases |
| Ironwood | V3 receipt 70000; spend; internal change 45000; irrelevant payment 25000; positions 0,1; one spend; SQL note_version 3 | No legacy Orchard receipt qualification |
| Ironwood-only batch | Explicit `(Sapling received/spent=0/0, Ironwood=1/0)` result and reference parity | Native only |
| Multi-chunk/empty | 1025 real irrelevant Sapling commitments in one block; total Sapling tree size 1028; empty heights 100005/100006, latter retained | No 1025-action Ironwood case; empty blocks do not qualify any pool |
| Semantic parity | Every table/column/row, including notes, values, positions, nullifiers, spends, change, blocks, tree storage, scan queue and retrieval requests | Only random account UUID and row order normalized; opaque SQL IDs otherwise deterministic in this corpus |
| Public requests/multiple batches | Imported UFVK; four bounded batches; public transaction_data_requests equality after each | Requests are observed, not fully serviced; no address-discovery/notification cycle |
| Trees/witnesses | Independent frontier roots; retained checkpoint IDs 100000/2/4/6; usable change witness in each pool at tip, path root equals persisted root | Latest change witnesses only; no pruning-window or historic spent-witness matrix |
| Failure atomicity | Mid-batch height/hash/invalid commitment and malformed identity fail; initial predecessor rejected without DB metadata; conflicting same-size Sapling/Ironwood frontiers reach scan-complete then typed put_blocks error; all raw rows unchanged | No power loss, cancellation or persistent VFS failure injection |
| Rewind/replay | Requested 100001, returned 100001 used to select suffix; recover rows, roots, witnesses/checkpoints; complete final state equals cached native rewind/replay | Internal cap/reference encodings can change; raw diff retained; no deeper-than-request rewind observed |
| Transparent (separate) | Real UTXO put/read 100000; repeat gives same ID; fixed parsed spend changes unspent read to None; repeated spend leaves all raw rows unchanged | Native only; compact scanner does not discover transparent activity; signatures not verified |
| Node unshared WASM | Real wasm-bindgen 0.2.128 initialization; same locked scanner graph, same bundled SQLite instance; setup/scan/commit/canonical-match; 1025 case included | Only main compact corpus; separate witness calls, transparent, rollback, import and rewind suite not replayed in WASM |
| Watchdog | Independent Python watchdog actually kills a control process at 1s with exit 124; Node/browser parent deadline 60s | Browser deadline code not executed |
| Browser no-SAB | Runnable dedicated-worker page prepared with actual generated module/glue | **Unexecuted**. Prior F1 sandbox launch failed setsockopt EPERM/SIGTRAP; no bypass attempted |
| Shared/threaded Node/browser | None | **Unexecuted** readiness, worker execution, bootstrap/failure cleanup/fallback |
| Storage/production | Real ephemeral migrated SQLite only | No Node filesystem/OPFS durability, SDK, G/F gate or independent-review completion claim |

The wrapper retains full `ScannedBlock` values, updates public `Nullifiers` and
prior metadata between blocks, then calls **one unchanged `WalletWrite::put_blocks`**.
It does not write wallet/tree rows itself. First-predecessor validation is
intentionally stronger than cached scanning when prior DB metadata is absent.
Typed read/scan/commit failures preserve the native error for diagnostics.

Rewind originally failed an overly strict raw encoding assertion: empty tree caps
became materialized and reference marks changed. Native cached rewind/replay
produced exactly the same final encoding. The test now requires unchanged semantic
state plus equality with that full native final state; no byte-level tree rewrite
or wallet patch was made. Failure-atomicity assertions retain full raw comparison.

## Commands and evidence

Run from the repository root; choose unused evidence labels:

```sh
python3 qualification/scanner/run.py native-replay 240 cargo test --offline --locked -- --nocapture --test-threads=1
python3 qualification/scanner/run.py wasm-build-replay 600 python3 build-wasm.py
python3 qualification/scanner/run.py node-replay 75 node /home/jack/zcash-scanner-scratch/replay-web/node.mjs
```

Normal tests never rewrite fixtures. `SCANNER_FREEZE=1` explicitly regenerates
native files; review any resulting fixture diffs. Native frozen-block loading reads
after generation; WASM embeds the already frozen protobuf bytes. Regenerate/review
the descriptor hashes after an intentional corpus change.

`run.py` uses scanner-owned Cargo cache/target/TMPDIR, jobs 2, captures full stdout/
stderr, and kills the entire process group on timeout. Its command ledger includes
hashes; the latest runner records both input and final inventories and selected
build environment. Early command entries recorded only their final inventories.

Full logs and provenance are in `/home/jack/zcash-scanner-logs`:

- `red-execution.log`: native commit succeeded, intentional inline stub failed.
- `native-final-locked.log`: seven tests passed, 53.06s test duration, no fixture rewrite.
- `ironwood-only-batch.log`: explicit isolated Ironwood count test passed.
- `native-reviewed.log`: final suite after fixture-loader review correction; seven passed, 55.47s test duration.
- `wasm-build.log`, `wasm-node-baseline.log`: generated module build and actual Node replay (about 5.02s process time; not a benchmark).
- `wasm-reviewed-build.log`, `wasm-reviewed-node.log`: rebuilt final source and successful Node replay; `final-consistency.log` verifies fixture hashes, graph versions, source cleanliness, syntax, whitespace and links.
- `commands.jsonl`, `graph-provenance.json`, native/WASM feature logs,
  `wallet-source-sha256.json`, `f1-inputs.json`, `wasm-artifacts.json`.
- Original raw canonical state and `rewind-snapshot-diff.json` preserve diagnosed failures.
- `watchdog-control.log`: expected exit 124; `format-check-unavailable.log`: rustfmt is absent. Compiler/tests and whitespace checks ran; rustfmt did not.

The F1 adapter is read from the hashed generator snapshot, never edited. The exact
approved wasm-bindgen binary is consumed directly. The browser blocker is prior F1
execution evidence at
`/home/jack/zcash-generated-runtime-logs/browser/browser-sandbox-launch-1789135109371254145.log`
(SHA256 `b74ec96f7234c1305b58cfa74f85e28a008127ec4897e9b75fbdd7394b20ea8c`), not a
scanner browser test result. Browser support remains mandatory.

Next bounded work is to execute the prepared no-SAB browser bundle once its
sandbox launch is available, replay the remaining native assertions in WASM, and
qualify shared-worker readiness and completion independently. Current successful
inline scan and commit provide no basis for an upstream scheduler patch.

Final generated scanner WASM SHA256:
`5522f4b608c412d8fbf12c7207a3e2a50fd40241165c6b09a309869e0efc0f76`.
Lock SHA256:
`6947df6fe679c437b828cc94fc15d82f769bed58467022f25ae0400a51963690`.
The original Node run's superseded build hashes remain in
`wasm-baseline-identity.json`; the reviewed executable bundle is preserved at
`/home/jack/zcash-scanner-scratch/replay-web/`.
