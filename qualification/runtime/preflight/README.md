# Disposable Node runtime experiment

Owner-authorized issue #2 qualification, isolated from the production SDK and
the existing qualification harness. Base:
`e270ac0e46fabfe2f081ee8db8ff31ed536fdc76`; branch:
`test/issue-2-node-runtime`.

**Blocked at output-directory preflight; no build or Node execution occurred.**
See [REPORT.md](REPORT.md) and [commands.md](commands.md).

Resumption requires a session whose filesystem policy permits writing both
`/home/jack/zcash-node-runtime-logs` and
`/home/jack/zcash-node-runtime-scratch`. Creating those directories outside this
session alone does not grant this session write access. The current policy has
approval disabled; this is an environment capability blocker, not missing owner
authorization. Do not redirect artifacts to another path or mutate the existing
qualification cache to bypass it.

After preflight succeeds, start a new bounded 30-minute experiment with two
build jobs, a 900-second timeout per build, a separate Cargo home/cache copy and
`CARGO_TARGET_DIR` under the runtime scratch directory. Read existing cached
sources/SDK without mutating them. Prefer offline dependencies; only required
dependency fetches are authorized. Match wasm-bindgen CLI to lock version
`0.2.128` and install any missing tools only in runtime scratch.

The requested implementation remains SQLite MEMSYS5 with a bounded static pool,
ZERO_MALLOC before configuration, C-side variadic configuration, and a real
lower host-services VFS supporting SQLite's built-in memdb. Preserve Rust
`wasm32-unknown-unknown` and the exact Common 1.0/wallet dependency identities.
Reject retained C heap allocator ownership and unknown imports; entropy loss
must fail closed. Static-pool configuration alone is not allocator qualification.

Before each adapter requirement, execute and retain its failing check. Then
execute real SQL commit/rollback/blob/integrity and real Common BLS pairing
equality/inequality in one Node worker module; test pool bounds/canaries/OOM,
omitted pool, interleaved Rust allocation and memory growth, actual entropy,
time/sleep callbacks, entropy loss, unknown imports and state loss on destruction.
Inspect final symbols/call reachability, imports/exports, memory and ABI limits.
Attempt browser-worker execution only in a subsequent bounded feasible slice.
Memdb has no durability claim. F1/F2/F3 and issue #2 remain open.
