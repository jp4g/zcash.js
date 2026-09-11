# Threaded runtime checkpoint report

Synthetic shared runtime bootstrap qualifies actual Rust Rayon in Node; Firefox 155.0.1 also passed actual isolated shared and secure no-SAB foreground execution. F2 remains open until the separately owned genuine scanner fixture is integrated and compared with serial ingestion.

| Gate / scope | Evidence status |
|---|---|
| Coherent dependency graph | All dependency lock records unchanged from baseline; only wrapper renamed and pinned direct Rayon edge added. Common 1.0 unchanged. |
| Shared link / generated initialization | GREEN with nightly-2026-09-01 (`1.100.0-nightly 0dfb098f3`), rebuilt std, SDK27 threaded C/libc, exact approved wasm-bindgen 0.2.128. |
| Actual shared memory envelope | Imported shared memory: initial 277 pages, maximum 4096 (256 MiB). Generated WASM contains 287 atomic instructions and 4 waits; no WASI imports. |
| Node real Rayon / owner SQL+BLS | GREEN: two compute worker_threads distinct from owner, indexed Rayon broadcast, distinct TLS/stack/live heap allocations, after-growth checks, SQL42, Common BLS pairing1, SQLite arena1, cycle44. |
| Bootstrap failure / timeout | GREEN Node: owner error/stall and partial compute error/stall; all spawned workers terminated before fresh baseline schema0, SQL42, BLS1. |
| Pool fault after readiness | GREEN Node: actual compute worker killed after committed SQL; whole domain invalidated; zero fallback calls and no mutation replay. |
| Memory mismatches | Expected LinkErrors for non-shared, excessive maximum, insufficient initial memory using real generated initialization. |
| Browser isolated and no-SAB | GREEN Firefox155.0.1/geckodriver0.37.1: six scenarios; actual two-worker Rust Rayon, secure COOP/COEP window and workers, separate non-isolated/no-SAB baseline, four failures with fresh fallback. |
| F1 full wallet/prover, F2 scanner parity | OPEN. No claim from scalar SQL/BLS or broadcast alone. |

Producing stage: `/home/jack/zcash-threaded-scratch/build-1789137003821175868`. Generated WASM SHA-256 `cad9e721a2eb30eef62254a735eb98a5cf7bd415692545391c062a1d34d0e509`. Browser bundle-2 manifest SHA-256 `213f75284f56fccb9abc5ed34530ab872d8566f213b7e4693bb2abd684838519`. Both hosts consume unmodified generated web-target glue; Node adapts actual Worker/parentPort at the host entry, not by fabricated imports or glue edits.

The small qualification adapter uses pinned Rayon public `spawn_handler` / `ThreadBuilder::run` and rebuilt std Mutex/Condvar. No scheduler/crypto algorithms copied. `wasm-bindgen-rayon` 1.3.0 archive was fetched by coordinator and inspected as reference only (archive SHA-256 `9a16c60a56c81e4dc3b9c43d76ba5633e1c0278211d59a9cb07d61b6cd1c6583`); it is not a runtime dependency. Its no-bundler blob helper would require extra Node browser-global emulation and external pool supervision, so the bounded public Rayon seam is smaller for this slice.

Retained failures include stable prebuilt std shared-memory link rejection, stable Cargo build-std rejection, sandbox crate DNS failure, missing nightly std dependencies, optional web_spin_lock dependency absent (unneeded in dedicated workers), missing TLS export during actual generation, initial absent supervisor module test, and initial Firefox helper import. These are setup/control observations, not unsupported-platform conclusions. Final generation exports the actual linker-provided TLS symbols before wasm-bindgen transforms the module; glue is never patched.

Exact raw logs and hashes live in `/home/jack/zcash-threaded-logs`: `firefox-1789137395952.json`, `browser-audit.log`, `node-runtime-first.log`, `node-runtime-final.log`, `node-pool-crash.log`, `memory-mismatch.log`, `node-controls-first.log`, `domain-red.log`, `domain-final.log`, `lifecycle-final.log`, `build-1789137003821175868-inspection.json`, and build-specific compiler/features/build/generate logs. Inspection records the exact linked SQLite archive member and C adapter hashes, threaded libc identity, and disassembly. `prerequisites.md` and `checkpoint.md` carry foreground commands and active process state.

All Rust work runs in dedicated workers; no UI-thread blocking synchronization. TLS/stack allocations are abandoned only with whole-domain destruction; the pool cannot be restarted in the same memory. SQLite remains SQLITE_THREADSAFE=0 with an owner-only 16 MiB MEMSYS5 arena and ephemeral memdb. No durability, full allocator stress, scanner parity, bundler packaging or deployment claim. [Scanner handoff](HANDOFF.md) lists the integration gates.

Foreground browser result: `firefox-1789137395952.json` exit0, six scenario passes. External BiDi audit confirms every failed threaded realm was destroyed before the fresh fallback realm was created; no-SAB scenario fetched no threaded artifact. Final live-worker inventory empty, session deleted, driver process group and browser process gone, loopback server closed. Port19447, unchanged confinement. Harmless Firefox internal graphics/favicon diagnostics are retained in driver log and not suppressed.

Resolved metadata maximum declared dependency MSRV: `1.91`; pinned nightly reports Rust1.100.0-nightly. `rust-src-hashes.json` retains hashes for 3636 installed std-library source files; compiler/version logs and unchanged Common package records accompany this evidence. This qualifies the exact dated toolchain, not every nightly or stable Rust release.
