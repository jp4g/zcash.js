# Persisted synthetic wallet and scanner qualification

Narrow issue #2 F3 integration, not a production SDK/API or issue #3 transaction
implementation. All mutations use the pinned public wallet migration, account,
`scan_block` orchestration, and unchanged `WalletWrite::put_blocks` routines.
Deterministic spending authority exists only in memory for the public all-zero
synthetic fixture. No seed or spending-key custody is implemented.

`inputs.json` pins storage 6b96bdd and scanner e338313 files by Git object and
SHA-256. Each build extracts those Git objects into its own stage and includes the
scanner's public Rust modules by explicit snapshot path. No evolving checkout is
compiled by reference, and no private wallet/tree/crypto algorithm is copied.
Only the fixed headerless encrypted Sapling/Ironwood protobuf corpus is accepted.
The scanner baseline's pending header and Python provenance fixes remain separate
integration prerequisites; its Python runners are not used here.

Wasm uses the exact storage C VFS, MEMSYS5 allocator, and host callbacks from the
pinned input. Genuine wasm-bindgen 0.2.128 web output is unedited and instantiated
once per owner; rusqlite and WalletDb share that module's SQLite connection.
Node uses its real filesystem and kernel flock. Browser uses exclusive OPFS
synchronous access handles. Policy is TRUNCATE rollback journal, synchronous FULL,
8-page cache, memory temporary storage, no WAL, ATTACH or concurrent readers.
Reopen omits SQLITE_OPEN_CREATE and does not migrate or seed. Missing paths and
query errors fail explicitly. Whole-table snapshots include UUIDs on persistence
comparisons; only separate native parity normalizes the one opaque account UUID.

The suite exercises created accounts, UFVK imports and several durable batches;
full table equality covers account metadata, addresses, public keys, notes,
nullifiers, spends, trees, checkpoints and scan queue. Public APIs additionally
read accounts, addresses, UFVKs and balances and obtain usable witnesses at the
retained checkpoints, including 1,025 later irrelevant Sapling commitments.
Every observation executes actual `PRAGMA integrity_check` and checks 66 migrations.
Native cached-scanner reference parity uses the same batch boundaries and runs
separately; it is not persistence proof. Cross-batch tree reference marks are
compared exactly against the matching native path, never removed from observations.

Interruption checkpoints occur after actual VFS journal sync, database write,
database sync and journal truncation inside the real scanner transaction. The
external owner destroys the worker before reopening. A separate Node OS process
is SIGKILLed and its signal exit observed, with actual hot-journal magic, recovery
writes, retained lease inode, second-writer rejection, retry and replay idempotence.
The ENOSPC control injects a write error into this real transaction; it is not
actual host quota exhaustion.

Build and run from the worktree, choosing a new stage (existing stages/logs are
never overwritten):

```sh
python3 qualification/wallet-durability/build.py /home/jack/zcash-wallet-durability-scratch/NEW-STAGE
WALLET_DURABILITY_PHASE=tracer STORAGE_BUNDLE=/home/jack/zcash-wallet-durability-scratch/NEW-STAGE/bundle timeout --kill-after=5s 150s node /home/jack/zcash-wallet-durability-scratch/NEW-STAGE/bundle/run-node.mjs
WALLET_DURABILITY_PHASE=interruptions STORAGE_BUNDLE=/home/jack/zcash-wallet-durability-scratch/NEW-STAGE/bundle timeout --kill-after=5s 180s node /home/jack/zcash-wallet-durability-scratch/NEW-STAGE/bundle/run-node.mjs
STORAGE_BUNDLE=/home/jack/zcash-wallet-durability-scratch/NEW-STAGE/bundle timeout --kill-after=5s 90s node /home/jack/zcash-wallet-durability-scratch/NEW-STAGE/bundle/run-process.mjs
```

Builds use the task's copied Cargo cache, targets and temporary files, jobs=2,
Rayon=2, offline and locked, and the already installed toolchain. The entire
non-root storage lock graph is checked unchanged. Registry archives and extracted
sources are checked against locked checksums; wallet VCS metadata is pinned to
a9142ee. Receipts preserve source, inputs, lock, tool identities, build logs,
feature graph, raw Wasm/map, native reference executable and generated assets.
The pinned byte inspector is executed with its assertions transformed into
unconditional exceptions, so Python optimization cannot disable evidence checks.

Actual Firefox execution belongs to the coordinator using its independently
corrected storage runner. This task does not repair the two reviewed runner P2s.
`run-host.py` requires explicit corrected runner path and SHA-256. It sets the supported STORAGE_LOG_DIR environment variable and exposes
the existing BiDi realm event list and requested phase through read-only routes. The browser waits for external destruction events before each
new owner. The existing runner's port ownership/cancellation logic stays unchanged:

```sh
WALLET_DURABILITY_PHASE=tracer STORAGE_BUNDLE=/home/jack/zcash-wallet-durability-scratch/NEW-STAGE/bundle timeout --kill-after=10s 200s python3 qualification/wallet-durability/run-host.py /ABS/CORRECTED/qualification/storage/run-firefox.mjs CORRECTED_RUNNER_SHA256
```

Repeat with `WALLET_DURABILITY_PHASE=interruptions` for the recovery phase.
Retain the corrected runner receipt, actual Firefox result and BiDi events. The
host needs secure, non-isolated, no-SAB dedicated workers with unchanged packaged
Firefox/geckodriver sandbox policy. A worker socket denial is not an architecture
blocker. This command must not use the rejected base runner as final evidence.

Actual quota exhaustion, eviction/restore, physical power loss, other browsers,
production key custody, outbox/operation locks/revisions, transactions/proofs,
threaded execution and complete F3 remain unqualified. Independent review and
coordinator host reruns are separate gates. Executed status, hashes and retained
failures are in `/home/jack/zcash-wallet-durability-logs/result.md`; early/resumable
commands are in `checkpoint.md` there.

Stage-7 executed outcome: Node tracer 3/3 and interruption 6/6 pass (8 distinct
scenarios); the same actual Firefox 155 OPFS phases pass 3/3 and 6/6. Firefox
externally observed all 30 dedicated-worker realms destroyed and recorded 30
before-reopen destruction barriers. Actual Node whole-process SIGKILL, second
writer EBUSY, hot-journal rollback and retry/idempotence pass. Coordinator Node
all-case and process reruns also pass. The final generated Wasm SHA-256 is
`5c6fdbe2ee80e8c444a2734e2ff19020599f063b23e2812e6fc2b3b37a1d8185`.
These results qualify the stated synthetic slice; the uncovered gates above and
independent integration review remain. Exact receipts and source/tool hashes are
in `/home/jack/zcash-wallet-durability-logs/result.md`.
