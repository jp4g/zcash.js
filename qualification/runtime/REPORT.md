# Node runtime partial slice — 2026-09-11

**The real same-module SQLite/Common probe links. Node execution is blocked by
unavailable approved wasm-bindgen generation; no SQL or pairing runtime success.**

Base `e270ac0e46fabfe2f081ee8db8ff31ed536fdc76`, branch
`test/issue-2-node-runtime`. Historical preflight commit:
`a9e27a5feb3a97a1029807a7e89b0ba5aa3bf379`.
Implementation/inspection commit: `e0c7046772707d1ce9db8815d9aa75e546c2d519`.
Standalone requested gpt-6-astra / medium, no agents or independent review.
Effective model effort has no independent tool attestation in this session.
The resumed slice started at 05:16 UTC and was stopped for the approval blocker
within its 30-minute budget. No build exceeded 900 seconds; Cargo jobs were 2.

## Executed results

| Check | Exit/result | What it establishes |
| --- | --- | --- |
| Initial output-directory preflight | 1, historical | Resolved by coordinator before this run; not technical incompatibility. |
| Offline build before C adapter | 101 | Actual final link failed on `sqlite3_os_init`. |
| Initial `node --test` invocation | 1 | Test-file failure before an artifact existed; output does not diagnose each requirement. |
| Offline build with real C adapter | 0 | Final wasm contains actual rusqlite/bundled SQLite and Common BLS fixture calls. |
| Node module import/export inspection | 0 | V8 compiled the module for inspection; no instance created. |
| `node qualification/runtime/test-runtime.cjs` | 1 | 11/11 fail strict import validation in worker threads before instantiation. |
| Metadata/features/archive/source audit | 0 | 240 target-filtered packages; exact lock and registry/source identity checks. |
| LLVM disassembly/symbol and artifact inspection | 0 | Static inventory and bounded allocator reachability findings below. |
| JS syntax check | 0 | Test script parses; not runtime success. |

All exact argv, exits, log paths and SHA-256 values are in [commands.md](commands.md).
Full external logs and recorder JSONL are preserved. Existing harness/audit code
was reused read-only; it was not repaired or represented as newly qualified.
No new harness was implemented. The adapter requirements have red checks but
**no green runtime tests**. Failures at the import gate do not establish that
individual SQL/crypto/allocator assertions can detect their intended defects.

## Approval blocker and chronology

The worker's GitHub CLI archive fetch failed with curl exit 6 (`Could not resolve
host: github.com`). Offline `cargo install` exited 101 because CLI `0.2.128` was
not cached. A worker online Cargo attempt, started before the coordinator stop,
exited 101 on `index.crates.io` DNS; its complete record is retained.

The coordinator then reported a successful host archive fetch. Its receipt is
`/home/jack/zcash-node-runtime-scratch/coordinator-fetch-receipt.md`; local SHA-256
verification of the archive gave
`b51f0208fdff83515a787bd8ab9ac5865ed84dabb66d0c709957bb59793c645f`.
This is not an authenticated upstream checksum or proof of executable availability.
The receipt reports extraction blocked by terminal security approval for archive
extraction to a sensitive path without unattended approval. The coordinator's
subsequent instruction also reports an alternative exact-version installation
blocked because the scanner misclassified the version as an IP address.
Those are coordinator-reported approval results, distinct from worker-observed DNS
failures. The worker did not attempt extraction, alternate spellings/paths/tools,
configuration changes or another installation after that instruction.

## Implementation and graph identity

The runtime crate copies the consumer manifest and lock without dependency edits.
Lock SHA-256 remains
`2c9b6faa9ff0b227e992bcc10ffb2127138c0258fce81fd45e223e451bf29d71`.
The archive/source audit enforces Common `=1.0.0` at
`f4526b0fa86406589732c8fb3849855fb92c43a2`, backend/SQLite `=0.1.0-rc4`
and PCZT `=0.1.0-rc2` at `a9142ee100b3a563b7d9ba7a8e94201d00ad8154`.
No graph migration, target switch, upstream patch or existing-cache mutation.
The graph audit records full edges/features and validates archives/extracted files;
it does not prove every compiled dependency is reachable in this fixture.

Rust remains `wasm32-unknown-unknown`, Rust `1.98.1`/LLVM `22.1.8`, Cargo `1.98.1`.
C uses read-only WASI SDK 27 clang `20.1.8-wasi-sdk`, revision
`87f0227cb60147a26a1eeb4fb06e3b505e9c7261`, explicit `wasm32-wasi` C objects.
Node is `v26.8.1`. The lock's wasm-bindgen version is `0.2.128`.

`env.sh` sets OS_OTHER, THREADSAFE=0, TEMP_STORE=3, OMIT_LOAD_EXTENSION plus
`LIBSQLITE3_FLAGS='-DSQLITE_ENABLE_MEMSYS5 -DSQLITE_ZERO_MALLOC -DLONGDOUBLE_TYPE=double'`.
The C wrapper calls variadic `sqlite3_config(SQLITE_CONFIG_HEAP, ..., 64)` entirely
within C before initialization. A static aligned 16 MiB pool has 64-byte guards
on each side. `sqlite3_os_init` registers a real lower VFS; SQLite initializes
its real memdb VFS, explicitly selected by rusqlite. Unsupported lower filesystem
open/delete operations return errors; no fake storage is supplied.

The intended host callbacks use Node WebCrypto, Date.now and a bounded 2 ms
worker-local busy wait with measured elapsed time (no SAB sleep primitive).
Entropy unavailability throws and requires instance destruction; short fills trap.
These implementations are linked/source-inspected, **not exercised**. The pairing
fixture is deterministic algebra; no deterministic entropy implementation exists.

## Artifact, imports, memory and allocator inspection

Preserved raw artifact:
`/home/jack/zcash-node-runtime-scratch/stages/adapter-link/issue_2_qualification.wasm`.
Size 12,934,851 bytes; SHA-256
`606a000bbb8dc51868e41d0d832285c7499862d64a2514b4110e73682ff8cecd`.
Preserved map SHA-256:
`4b84176c323095479688f2464e35a8340c89b1edd5b6318b0d54648a6aa13901`.
The final inspection log also hashes adapter/SQLite objects, clang, libc archive,
source, manifest environment and test script. No transformed artifact exists.

The actual seven imports, all functions, are:

- `runtime_host.entropy`
- `runtime_host.sleep`
- `runtime_host.utc_ms`
- `__wbindgen_placeholder__.__wbindgen_describe`
- `__wbindgen_placeholder__.__wbg___wbindgen_throw_5d9e815e6fdf150f`
- `__wbindgen_externref_xform__.__wbindgen_externref_table_grow`
- `__wbindgen_externref_xform__.__wbindgen_externref_table_set_null`

No WASI host imports are present. There are 87 exports and 5,073 functions
including imports; the complete export inventory is retained in the inspection
log. Exports include memory, heap globals, `rt_*` fixtures and wasm-bindgen
bookkeeping/descriptor exports. The strict loader expects only its three host
imports and rejects the four unprocessed binding imports. None is stubbed.

One defined non-shared wasm32 memory starts at 275 pages (18,022,400 bytes), with
**no declared maximum**. It is not a bounded total-memory configuration: only the
SQLite arena is intended to be bounded. No memory-growth/refresh runtime check ran.

LLVM disassembly contains one `memory.grow`, in Rust dlmalloc's `System::alloc`.
The linker map retains no WASI libc malloc/calloc/realloc/sbrk member, and the
full function inventory contains no competing C heap allocator entry. Retained
libc members provide string/math/sort/timezone/error/exit support; their exact
list is retained. SQLite MEMSYS5 allocation functions and the ZERO_MALLOC default
are present. Rust allocation wrappers and wasm-bindgen allocation use Rust's heap.
No C heap ownership was found anywhere in this raw linked module, so there is no
retained C heap function available for either direct or indirect invocation.
This is stronger than a symbol-name conflict check, but not runtime ABI proof.

The inspector traces direct-call closure from every exported `rt_*` function and
lists indirect-call boundaries explicitly. SQLite allocator dispatch and VFS
callbacks are indirect and remain dynamically unqualified. Rust growth is directly
reachable from `rt_grow` and SQL's Rust allocation paths; none appears in the
C initialization/pool-check direct closures. Reinspect after actual binding
transformation and after any adapter change.

## ABI limits and unpassed gates

C compile-time assertions check 32-bit pointers/ints, 64-bit SQLite integers and
doubles, and 8-byte double alignment. JS fixture arguments/results are scalar
integers or a double; only host entropy fills a checked linear-memory range.
No arbitrary variadic or aggregate Rust/C ABI is qualified. SQLite structures,
callbacks, cross-language stack alignment, destructor behavior, pointer ownership,
pool separation from Rust's heap, memory growth and canaries need executed tests.
Panics/host exceptions invalidate this disposable instance; this is not a recovery
or safe public SDK ABI. THREADSAFE=0 prohibits concurrent calls.

F1 remains partial: final link and static graph/import/allocator inspection exist,
but generated initialization, same-instance SQL plus BLS, wallet/prover exports,
all entropy generations, Node and browser execution are unqualified. F2 scanners,
serial fallback and threaded/Rayon liveness remain unexecuted. F3 durable Node/OPFS
storage, flush/reopen/crash/locking/quota remain unexecuted. Memdb has no durability
claim; even expected state loss has not been observed here.

Follow-on must use an approved exact generator, preserve/hash its outputs, adapt
the loader to real generated imports, and rerun each red requirement. Extend the
fixtures to execute SQL and pairing in the same living instance, interleave
multiple SQL/Rust allocation cycles, check detailed unsupported host errors, and
actually destroy/recreate a worker. At the original report revision, `destruction` only compared two live instances.
The first review-fix cycle changes that assertion and orchestration, but real
lifecycle qualification is still pending; see [review-fix.md](review-fix.md). Add isolated
negative controls before qualifying each behavior. Browser is optional subsequent
work after Node. No #2 completion, production support or independent review claim.
