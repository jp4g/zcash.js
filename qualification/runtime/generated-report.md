# Real generated binding qualification — 2026-09-11

**Node executes the real generated module: 17/17 cases pass for target-nodejs,
and 17/17 for target-web loaded in Node workers. Browser execution remains blocked
by the local sandbox. F1, F2, F3 and issue #2 are not complete.**

This is the authorized disposable runtime slice on `test/issue-2-generated-runtime`,
base `e73f423b35dffd6478d2150b7fd488064c71ddd9`. Requested primary role:
gpt-6-astra HIGH; the browser subtask inherited that role. No independent model
attestation or independent review is claimed. Commits `5f696d2`, `c315add`, and
`c8d1a47` contain the generator integration, executed fixtures and static inspector.
Browser runner checkpoint: `fc45b0a`. The coordinator retains global ledger/API documentation and merge ownership.

## Producing source and artifact identity

The approved executable reported `wasm-bindgen 0.2.128`, exactly matching the lock.
Read-only archive verification matches the owner-provided digest. No installation,
extraction, dependency download, fabricated glue, unknown-import resolver or WASI
stub was used. Both generated JavaScript files are preserved unedited.

| Input/output | SHA-256 |
| --- | --- |
| Generator executable | `dc9e4f1e03996c26fb8bfedfded73d81120a37251c3f19eb87bb460f1f89a5be` |
| Original generator archive | `b51f0208fdff83515a787bd8ab9ac5865ed84dabb66d0c709957bb59793c645f` |
| Runtime Cargo.lock | `4a50859ce125ba76f5629dbba81079c6da6ed2b26c6e717a251715e82050f826` |
| Final raw WASM | `8f4c77fbdf8a8a13f233bfa7b5d225e00a0e12e80f7b28da7dc9cd0edf96c430` |
| Raw link map | `bce1ec690c92de3be7ea0d6011c54817a23aa7de2ad3b9662ef1456be0aed05a` |
| Generated web and Node WASM (identical) | `b054d224151161ed550985873fdadd21caa29357ee9452bc787d2f5993768895` |
| Generated web JavaScript | `e1b1591e59e4ab554f6292d3b964385acd147ce9eda5720fe393f04f4f21d235` |
| Generated Node JavaScript | `266ba93aec0db6dec07480f823b8ae886b41c42186e1020e0e97fc7c6637d65a` |
| Producing provenance.json | `bdb68f913be4e4586a46130e686eb7fb2e7a9ce924607aa24afec589b06a07d9` |
| Execution consumer-provenance.json | `bf71a39279adc453ef8711b72a9aa5b9132a02913e428820727d2c79aecfe3a7` |

Final producing bundle:
`/home/jack/zcash-generated-runtime-scratch/build-1789135187453484355/`.
Its `sources/` contains byte snapshots; `raw/` contains
`issue_2_qualification.wasm` (13,030,986 bytes) and `runtime.map`;
`web/` and `nodejs/` contain generated `qualification.js`,
`qualification_bg.wasm` (3,730,858 bytes), and both declaration files.
`provenance.json` records exact before/after source hashes, raw/generated hashes,
producer object hashes, generator/archive identity, source base commit, and build
and generation command records. The recorded source commit is the parent at build
time; snapshots, rather than that parent alone, identify the changed producing files.

The final Cargo compiler-artifact message names this runtime manifest, the exact
WASM output and `fresh:false`. Every captured source was rechecked against the
current file. Builds used `--offline --locked`, `wasm32-unknown-unknown`, two jobs,
and the new `/home/jack/zcash-generated-runtime-scratch/target` plus new TMPDIR.
The shared old Cargo registry/cache and WASI SDK were read only. No old target or
historical evidence was overwritten. Both initial generation and the first fresh
build remain under `initial/` and `build-1789134789001628123/`; both earlier
consumer versions remain preserved.

The sole dependency change adds existing locked wasm-bindgen as a direct runtime
wrapper dependency. A parsed lock comparison confirms all package identities,
checksums and other dependency edges equal the consumer graph: Common 1.0.0,
wallet backend/SQLite RC4 and PCZT RC2 remain unchanged. The consumer files were
not edited. This comparison does not independently re-audit every cached archive.

## Consumer and actual generated contract

Final execution bundle:
`/home/jack/zcash-generated-runtime-scratch/execution-2/{web,nodejs}/`.
`consumer-provenance.json` binds every copied generator file to the producing
manifest and hashes separately authored `loader.mjs`, `runtime-host.mjs` and private
package-type metadata. Packaging never rewrites generated JavaScript or WASM.
The shared environment-neutral loader invokes real generated initialization.
The Rust `raw_exports()` bridge uses `wasm_bindgen::exports()`; the generator
emits its real implementation for both targets. The C host import is now relative.

All six actual transformed imports are functions:

- `./runtime-host.mjs.entropy`
- `./runtime-host.mjs.sleep`
- `./runtime-host.mjs.utc_ms`
- `./qualification_bg.js.__wbg___wbindgen_exports_3d3410a3b95d7b41`
- `./qualification_bg.js.__wbg___wbindgen_throw_5d9e815e6fdf150f`
- `./qualification_bg.js.__wbindgen_init_externref_table`

The loader requires exactly this inventory before initializing. The generator
supplies its own binding functions and externref initialization; the host supplies
actual WebCrypto entropy, UTC time and bounded measured worker-local sleep.
Entropy ranges are checked against a freshly obtained memory buffer on every call.
Unknown imports, missing providers and missing pool configuration fail closed.
Node's native CommonJS loading of the relative ESM host is exercised on Node
**26.8.1 only**; other Node versions/package support remain separate qualification.

## Executed cases and controls

Both target modes execute in dedicated `worker_threads`. Each scenario gets a
fresh worker; owner cleanup awaits actual termination on success or failure.
The destruction case terminates the populated original before creating a new
worker, opens a real memdb and requires a successful zero-row sqlite_schema result.
A query error cannot mean an empty database.

The 17 passing scenarios per target cover:

- Real rusqlite commit and rollback, two 65,536-byte patterned blobs, exact sum 42,
  row count two and `PRAGMA integrity_check=ok`; real Common BLS pairing equality
  and inequality execute in that same living SQL instance.
- A separate pairing case; pool alignment/bounds and both canaries; exhaustion
  and recovery of the 16 MiB MEMSYS5 pool. A 32 MiB zeroblob insertion returns
  SQLite OutOfMemory and leaves row count and integrity intact.
- Rust allocation growth, detached old views, fresh entropy writes and retained
  SQL state. The stronger interleaving case allocates 32, 48 and 64 MiB successively,
  with committed SQL updates followed by rolled-back deletes, both blob checks,
  integrity, BLS pairing, host callbacks, heap content and pool checks each cycle.
  The committed sums are 44, 46 and 48; memory sizes are 51,838,976, 102,236,160
  and 169,410,560 bytes. These are observed allocation extents, not benchmarks.
- Host entropy/UTC/2 ms sleep; entropy absent at initialization and entropy lost
  after initialization; omitted pool; unknown imports; worker death and empty
  replacement; repeated initialization/open refusal; unopened SQL trapping;
  exact unavailable lower filesystem error codes and diagnostic text.
- Intentional pool-canary corruption causes the check to return zero; intentional
  Rust heap corruption causes the heap check to return zero. Faulted instances
  are discarded with their workers; neither control substitutes cryptography.

Existing worker/lifecycle controls pass, including premature exit zero/nonzero,
deadline, cancellation and cleanup ordering. The final Node control invocation
passes five files (12 inner controls); Python inspector controls pass three tests,
and the existing foundation harness passes 12 tests. These synthetic controls
are not wallet/browser/durability evidence. Historical and review-fix inspections
also still pass with their original pinned artifact/map pairs.

## Failures retained and narrowly repaired

1. The original loader still failed all 11 cases before instantiation on the raw
   binding imports (recorded baseline). The initial genuine generator controls
   then failed on the absent Node bridge, bare host import and removed heap global.
   The genuine Rust bridge, relative C import and `--keep-lld-exports` resolve them.
2. Missing host and loader modules caused their new controls to fail first; actual
   host services and exact inventory checking made them pass.
3. The first generated Node run failed all 11 cases at the loader's diagnostic
   externref check. It incorrectly looked at the table's current end. Actual
   `raw_exports()` legitimately grows the table from its initial extent; generated
   sentinels remain at offset 1024. The corrected check follows the inspected
   generated contract. No generated code was changed or initialization skipped.
4. The expanded suite then passed 14 cases and failed three for missing
   `rt_cycle`, `rt_heap_ptr` and `rt_unsupported_hosts`. Their substantive fixtures
   were added and freshly rebuilt before the final 17-case passing runs.
5. Bundle-input rejection tests failed before the verifier existed and now reject
   changed raw/map/generated/source members and changed producing-source records.

The early red import/missing-module tests establish sequencing, not mutation
coverage of every ABI assertion. Successful corruption, unopened-SQL, omitted-pool,
entropy-loss and lifecycle negatives establish their narrower actual controls.

## Static allocator and memory findings

Fresh raw and both transformed inventories/disassemblies were regenerated from
private snapshots of the selected bytes. The raw module has 93 exports and 5,149
functions; each transformed module has 25 exports and 4,977 functions. Both retain
all scalar fixtures, memory, heap globals and real generated binding machinery.
The raw link map is identified explicitly as the raw map, never as transformed
function-index evidence.

All three modules define one non-shared wasm32 memory, initially 275 pages
(18,022,400 bytes), with **no declared maximum**. Only SQLite's pool is bounded;
there is no total-memory cap. Executed pool start is 1,180,536, pool size 16,777,216,
and Rust heap base 17,990,592. Pool end is below the Rust heap base.

There is one `memory.grow` instruction, owned by Rust dlmalloc System::alloc.
No retained libc malloc/calloc/realloc/sbrk member or competing C heap entry is
found. Full libc-member inventories and direct-call closures with indirect
callback boundaries are in the inspection logs. Runtime exercises actual SQLite
allocator/VFS callbacks and scalar Rust/C calls; arbitrary aggregate/variadic
cross-language ABI and all destructor/ownership paths are not qualified.
Toolchain: Rust 1.98.1 / LLVM 22.1.8, Cargo 1.98.1, WASI SDK 27 clang 20.1.8.

## Mandatory browser blocker and next gates

The early handoff and its updates are preserved at
`/home/jack/zcash-generated-runtime-logs/browser-handoff.md`.
The final real web execution path is `execution-2/web/`, with the same shared loader.
The separate [browser report](browser/REPORT.md) records its prepared dedicated-worker
runner, synthetic controls, provenance and concrete launch failure.

The sandboxed Chromium launch exited with SIGTRAP after
`socket.cc:45 setsockopt: Operation not permitted (1)`. Command exit: 1.
Log: `/home/jack/zcash-generated-runtime-logs/browser/browser-sandbox-launch-1789135109371254145.log`;
SHA-256: `b74ec96f7234c1305b58cfa74f85e28a008127ec4897e9b75fbdd7394b20ea8c`.
No alternate launch flags, browser or security settings were used to bypass this
boundary. Browser execution needs a permitted sandboxed environment; the launch
failure does not establish an upstream browser/WASM incompatibility.

F1 remains partial: browser execution, real wallet/prover exported paths, all RNG
generations and the threaded artifact are unqualified. F2 actual scanners,
serial equivalence and threaded/Rayon liveness remain separate. F3 real Node
filesystem and browser OPFS durability, reopen/crash/locking/quota remain separate;
memdb is ephemeral and replacement correctly loses state. No production SDK,
live-chain/provider/funds activity, publication, push or merge was performed.
Independent HIGH review and coordinator disposition remain next steps.

## Reproduction and retained command evidence

[generated-commands.md](generated-commands.md) records exact commands, exits and log
hashes, including failures. Logs live in `/home/jack/zcash-generated-runtime-logs/`.
`final-input-receipt.json` supplies runtime environment values omitted by the
unchanged recorder's fixed environment subset, plus runner snapshots/hashes.
`verify-final-evidence.py` and its recorded exit-zero run recheck current producing
sources, compiler output identity, raw/generated/copied assets, runner snapshots,
locked package identities, tool/archive hashes and all recorded command-log hashes.
It is a post-execution consistency check, not independent provenance authentication.

Replay the final runtime evidence with the preserved bundle:

```sh
RUNTIME_BINDINGS=/home/jack/zcash-generated-runtime-scratch/execution-2 node qualification/runtime/test-runtime.cjs
RUNTIME_TARGET=web RUNTIME_BINDINGS=/home/jack/zcash-generated-runtime-scratch/execution-2 node qualification/runtime/test-runtime.cjs
python3 qualification/runtime/inspect.py --bundle /home/jack/zcash-generated-runtime-scratch/build-1789135187453484355 --target web
```

`build-generated.py` records fresh builds and refuses a Cargo-cached leaf producer;
a repeat unchanged build is not relabeled as fresh evidence. Reuse the preserved
producing bundle for inspection/replay. Future fixture changes must again produce
and preserve their own fresh build. Do not modify or clean historical scratch.
