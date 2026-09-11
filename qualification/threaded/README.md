# Issue #2 shared runtime qualification

Only synthetic qualification. Base `31ab65e4e09f9e0ade1517df3516f650fbca8496`; no production runtime/scanner/storage/API changes. Common 1.0 graph package records remain byte-for-byte equivalent as parsed lock records, with only the wrapper name and direct pinned Rayon edge changed. SQL is ephemeral MEMSYS5/memdb, never durability evidence.

The minimal adapter uses Rayon 1.12.0 / rayon-core 1.13.0 public `spawn_handler` and `ThreadBuilder::run`. Prestarted workers use rebuilt std Mutex/Condvar to receive their indexed thread builders. This avoids copying scheduler algorithms or requiring browser helper globals in Node. WASM is produced with pinned nightly-2026-09-01, std rebuild, atomics/bulk-memory, shared imported memory with 256 MiB maximum; WASI SDK 27 threaded C objects/libc; unmodified wasm-bindgen 0.2.128 web-target glue in both hosts. These are recipe inputs until producing and runtime evidence is recorded.

An external supervisor owns the wallet owner and every compute worker, caches startup readiness, rejects calls before readiness, imposes finite bootstrap/operation deadlines, and terminates the entire domain on a fault. Startup alone can select a fresh immutable baseline after teardown. After readiness a fault rejects operations with uncertain effects and never falls back/replays. No worker pool is reused after partial failure.

`parallel_evidence` uses actual Rust Rayon broadcast on every pool worker, simultaneous Rust allocations, TLS markers, and distinct stack addresses. SQL and Common BLS calls remain in the owner. This establishes a bootstrap/integration seam only; a sum/broadcast does not establish scanner equivalence or F2 completion.

Scanner handoff: add the separately qualified fixture crate/export to this owner crate, invoke only after `owner_build` readiness, add an explicit operation in `worker.mjs`, and preserve the same fixed fixture digests and serial/threaded effect comparison. Do not run SQL from a Rayon worker. Preserve all pools, multiple batches, notes/nullifiers/trees/checkpoints/spentness and finite completion evidence. Scanner creation is assigned elsewhere.

Commands and resumable prerequisites are in `/home/jack/zcash-threaded-logs/prerequisites.md`; active work is in `checkpoint.md`. No push/merge or support completion claim.
