# Persisted wallet integration prerequisite (partial F3)

This qualification consumes the fixed scanner at `a61dccd` and measured storage
sources from **this repository checkout**. `inputs.json` requires complete file
inventories, pinned Git objects, and byte equality with the checkout before a
build. Missing, stale, altered, or extra sources fail under ordinary and optimized
Python. The build copies verified sources into a new immutable stage; no sibling
worktree source is used. The scanner is included unchanged; consumer root
re-exports resolve the scanner's existing `crate::` references. No wallet/scanner
algorithm is forked and the selected published dependency graph remains unchanged:
wallet `a9142ee`, backend/SQLite RC4, PCZT RC2, Common **1.0.0**.

Wasm uses the measured storage C VFS, MEMSYS5 allocator and host callbacks.
Genuine wasm-bindgen 0.2.128 output is unedited and instantiated once per owner;
rusqlite and WalletDb use the same SQLite connection. Node uses real files, fsync
and kernel flock; Firefox uses exclusive OPFS synchronous access handles and
flush. The policy remains TRUNCATE journal, synchronous FULL, 8-page cache, memory
temporary storage, no WAL or ATTACH. Reopen does not CREATE, migrate, or seed.
The public all-zero synthetic seed is used in memory only, with no custody API.

The existing bounded cases preserve all table/column observations and SQLite
types, exact persisted UUIDs, public account/address/key metadata, balances,
roots, witnesses, 66 migrations, and integrity. Only the separate native parity
comparison canonicalizes the opaque UUID. Native created/imported scans use the
same transaction boundaries as Wasm; meaningful tree/SQL bytes are not normalized.
Interruption checkpoints perform real VFS operations before external destruction.
ENOSPC is injected into the real transaction and does not establish quota coverage.

## Explicit location parameters

Use installed tools and a populated local Cargo registry cache; no install or
network command is performed. Set only locations that vary:

```sh
export WD_SCRATCH=/absolute/owned/new-scratch
export WD_SDK=/absolute/wasi-sdk-27.0-x86_64-linux
export WD_BINDGEN=/absolute/wasm-bindgen-0.2.128
export WD_WALLET_REPO=/absolute/upstream-wallet-git-checkout
export STORAGE_LOG_DIR=/absolute/owned/logs
export TMPDIR="$WD_SCRATCH/tmp"
export PYTHONDONTWRITEBYTECODE=1
mkdir -p "$WD_SCRATCH/tmp" "$STORAGE_LOG_DIR"
# Populate WD_SCRATCH/cargo with a private COPY of a cached Cargo home.
# Do not share writable Cargo caches or targets with prior qualifications.
python3 qualification/wallet-durability/build.py "$WD_SCRATCH/NEW-STAGE"
export STORAGE_BUNDLE="$WD_SCRATCH/NEW-STAGE/bundle"
WALLET_DURABILITY_PHASE=tracer timeout --kill-after=5s 150s node "$STORAGE_BUNDLE/run-node.mjs"
```

Builds derive `cargo`, `target`, and `tmp` beneath WD_SCRATCH, run offline and
locked with two build/Rayon threads, and record installed Rust/C/Node/generator
versions and digests. WD_WALLET_REPO supplies pinned Git objects for independent
source verification, not compiled path dependencies. The full non-root storage
lock graph, every archive checksum and extracted file inventory are checked.
Cargo's `.cargo-ok` marker is the only ignored extracted-file metadata. Audits
also require exact upstream Git source inventories (180 Rust files).

Get a complete native/Node/Firefox tracer before the full existing bounded cases:

```sh
WALLET_DURABILITY_PHASE=tracer STORAGE_DRIVER_PORT=19459 timeout --kill-after=10s 200s python3 qualification/wallet-durability/run-host.py qualification/storage/run-firefox.mjs fe0efdfe0315ef62d6cf310875e9e0f781fc7f769368102080d6b6247b089007
WALLET_DURABILITY_PHASE=all timeout --kill-after=5s 180s node "$STORAGE_BUNDLE/run-node.mjs"
timeout --kill-after=5s 90s node "$STORAGE_BUNDLE/run-process.mjs"
WALLET_DURABILITY_PHASE=interruptions STORAGE_DRIVER_PORT=19460 timeout --kill-after=10s 200s python3 qualification/wallet-durability/run-host.py qualification/storage/run-firefox.mjs fe0efdfe0315ef62d6cf310875e9e0f781fc7f769368102080d6b6247b089007
python3 qualification/wallet-durability/audit.py "$WD_SCRATCH/NEW-STAGE"
python3 -O qualification/wallet-durability/audit.py "$WD_SCRATCH/NEW-STAGE"
python3 -I qualification/wallet-durability/test-inputs.py
python3 -I -O qualification/wallet-durability/test-inputs.py
python3 -I qualification/wallet-durability/test-audit.py "$WD_SCRATCH/NEW-STAGE"
python3 -I qualification/wallet-durability/test-host.py "$WD_SCRATCH/NEW-STAGE"
python3 -I -O qualification/wallet-durability/test-host.py "$WD_SCRATCH/NEW-STAGE"
```

The corrected Firefox runner is required to be the pinned file in this checkout.
It retains its installed `/snap/bin/geckodriver` host prerequisite and browser
sandbox policy. The wrapper only exposes existing realm events and test phase;
its receipt binds the exact adapted bytes, original responder, wrapper, bundle
provenance, and phase. The bundle and wrapper must match the closed stage. The resolved bundle path
forwarded to the host must be the exact directory whose inventory was checked.
Dedicated-worker destruction events must precede each reopen, with final external
confirmation. A denied loopback socket requires host execution of the same command;
it is a concrete environment blocker, never a browser qualification pass.
The measured byte inspector is reused with its SDK executable location relocated
and every Python assertion converted to an unconditional exception. This is wrapper
adaptation, not a change to upstream/runtime source.

Old stage-7 and failure evidence remain frozen; the historical REPORT.md records
that earlier bounded result. New integrated evidence and exact local commands are
in `/home/jack/zcash-wallet-integrated-logs/REPORT.md`, with CLI status separately
in `CLIresult.md` and resumable checkpoints in `checkpoint.md`. Local reproduction
with already installed tools/caches is not a fresh-machine installation result.

Full F3 remains open: actual quota/eviction/restore, populated external migration
failure/rollback, account-creation rollback, operation locks/outbox/revisions and
applicable recovery consistency are not added here. No shared/threaded/SDK work,
live chain/funds, publication, push, or merge is part of this slice.
