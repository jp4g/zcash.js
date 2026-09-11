# Disposable Node runtime qualification

**Real wasm link succeeds; Node runtime remains blocked before instantiation.**
This is an isolated issue #2 experiment, not a production SDK. See
[REPORT.md](REPORT.md), [exact commands/exits/log hashes](commands.md), and the
[historical output-directory failure](preflight/REPORT.md).

The runtime crate preserves the consumer's exact manifest and lock, Common 1.0
and wallet pins. It adds a C lower host-services VFS, real built-in SQLite memdb,
MEMSYS5 with a 16 MiB static arena, and ZERO_MALLOC. Rust owns the growing heap.
SQL and real Common BLS fixtures are linked into the same module. No fixture
has executed: the Node loader rejects retained wasm-bindgen transformation imports.

The matching wasm-bindgen CLI is `0.2.128`. Worker downloads failed DNS; the
coordinator subsequently obtained an archive, but terminal security approval
blocked extraction and an alternative installation. **Do not extract/install
through another path, spelling, tool or agent to bypass that gate.** No permission
or configuration change is part of this slice. Follow-on work needs an approved
matching generator; downloaded archive bytes are not an installed executable.

The executed build recipe, from the worktree root, was:

```sh
source qualification/runtime/env.sh
python3 qualification/harness.py --logs /home/jack/zcash-node-runtime-logs --timeout 900 adapter-link cargo build --offline --locked --manifest-path qualification/runtime/Cargo.toml --target wasm32-unknown-unknown --lib
python3 qualification/harness.py --logs /home/jack/zcash-node-runtime-logs --timeout 120 node-first node qualification/runtime/test-runtime.cjs
```

The build exited 0; the Node test command exited 1 (11 failed import checks).
The existing recorder is reused without modification. Its environment subset
omits SQLite allocator flags, so retain this exact `env.sh` with the evidence.
`CARGO_HOME`, `CARGO_TARGET_DIR` and `TMPDIR` point only to runtime scratch.
The old cache/source/SDK is read-only; only the copied Cargo cache is mutable.
All output is under `/home/jack/zcash-node-runtime-{scratch,logs}`.

With an approved generator, first verify its exact version and provenance, run
its actual transformation, preserve both raw and generated modules, and inspect
all generated code/imports. Adapt the worker loader to the genuine generated
initialization/import contract. Do not simply expand the current strict import
allowlist or stub the transformation imports. Repeat memory/allocator inspection
on the transformed artifact, then execute and repair each red runtime check.

Required follow-on checks include SQL commit/rollback/blob/integrity and pairing
in one living instance; pool bounds/canaries/OOM/omission; Rust allocation growth
interleaved with SQL and refreshed host memory views; entropy/time/sleep and
entropy loss; and actual worker destruction followed by a fresh empty memdb.
The current destruction fixture checks instance separation while both instances
are alive, so it must be extended to actual destroy/recreate. Add meaningful
negative checks per adapter behavior; the current red import failures do not
provide that coverage. Browser worker execution remains a later bounded slice.

Memdb is ephemeral. F1 is partial; F2 and F3 remain unresolved. Do not claim #2
complete or use this experiment as durable storage or wallet runtime approval.
