# Issue #2 qualification slice — 2026-09-11

**Native control passed; diagnostic wasm checking passed; final linking failed
at the SQLite host boundary. Issue #2 is not complete.**

Standalone primary implementation, requested gpt-6-astra / medium; no other
workers or independent review. Branch: `test/issue-2-wasm-qualification`.
Steering, CONTRIBUTING, decision log, host architecture, workplan and source
capability mapping were read. GitHub issue #2 body/comments were fetched with
the actual `gh` binary; its acceptance includes scanners, threaded execution and
durability beyond this bounded slice. No coordinator ledger or API docs changed.

## Executed gates

| Gate | Result and precise scope |
| --- | --- |
| Native graph/control | PASS on Linux x86_64: all dependencies built, then actual bundled SQLite opened an ephemeral connection, created a table, committed two rows and queried sum 42. Actual Common BLS12-381 pairings checked `e(2G1,G2) == e(G1,2G2)` and inequality to `e(G1,G2)`. |
| Rust `wasm32-unknown-unknown` check | PASS **only with WASI-target C objects**, after additive JS entropy features. This is not a pure browser-target C build or ABI qualification. |
| Real-symbol final link | FAIL (101). The exported function calls rusqlite and BLS pairings; this is not an empty rlib check. Missing libc symbols and `sqlite3_os_init` prevent the cdylib. |
| Link with WASI libc diagnostic | FAIL (101), with error limit disabled: sole reported undefined symbol is `sqlite3_os_init`. WASI libc is not thereby qualified for Rust/browser allocation or host calls. |
| Final imports/memory/ABI inspection | No final `.wasm` produced, so no final import list, memory limits/sharedness or generated JS glue was observed. Intended probe ABI is `qualification_probe() -> u32`, C calling convention, no pointer arguments. ABI/runtime compatibility remains unqualified. |
| Node runtime | NOT EXECUTED: final module unavailable. Node v26.8.1 was inventoried, not used to claim instantiation. |
| Browser runtime | NOT EXECUTED: final module unavailable. No browser-worker, no-SAB or isolation result. |
| Storage durability | NOT EXECUTED. Native in-memory SQL proves neither Node filesystem nor OPFS persistence, migrations, crash recovery or single-writer enforcement. |
| Scanning/threading | NOT EXECUTED. No actual scanner fixtures, Rayon bootstrap, shared memory or threaded artifact. Rayon remains in the graph; disabling crypto multicore defaults does not settle scanner liveness. |
| Protocol/proofs | NOT EXECUTED. Proofs and PCZT roles compile in the dependency closure; the pairing check is not a Sapling/Ironwood proof, transaction, protocol vector or wallet flow. No proving parameters acquired. |

## Dependency and toolchain identity

The dependency-only consumer pins backend and SQLite to `=0.1.0-rc4`, PCZT to
`=0.1.0-rc2`, and all 17 Common packages (including `zakura-proofs`) to `=1.0.0`.
The three wallet registry packages' VCS metadata matches
`a9142ee100b3a563b7d9ba7a8e94201d00ad8154`; all Common registry packages match
`f4526b0fa86406589732c8fb3849855fb92c43a2`. No Common 1.1/1.2 packages, duplicate
Zakura identities or forbidden upstream counterparts occur in either audited
graph. No production or upstream source patch was made.

The final lock has SHA-256
`2c9b6faa9ff0b227e992bcc10ffb2127138c0258fce81fd45e223e451bf29d71`.
It locks the separately resolved third-party closure (255 lock packages), not an
asserted byte-identical wallet-workspace resolution. Target-filtered metadata
contains 236 native and 240 wasm packages including the consumer/build graph.
Both audits validate every registry archive against its lock checksum and every
archived file against the extracted source, then enforce the Common/wallet VCS
pins. Normalized full dependency edges, features, MSRVs and hashes are retained
in [native](evidence/graph-x86_64-unknown-linux-gnu.jsonl) and
[wasm](evidence/graph-wasm32-unknown-unknown.jsonl) evidence. The archive checks
verify fetched bytes, not a cryptographic signature by upstream authors.

Native and target Rust: `rustc 1.98.1 (48a229cea 2026-09-01)`, LLVM 22.1.8;
Cargo `1.98.1 (797e8a9bc 2026-08-05)`. Native C: Ubuntu GCC 15.2.0.
`cargo-env.sh` rejects a different recorded Rust version. No rustup/global
toolchain installation or system package change was made. WASI SDK 27.0 was
downloaded into scratch and verified against release SHA-256
`b7d4d944c88503e4f21d84af07ac293e3440b1b6210bfd7fe78e0afd92c23bc2`.
Exact compiler version output is in the indexed `wasi-clang-version` log;
compiler, libc, native binary and SQLite object hashes are in
[artifact metadata](evidence/artifacts.json).

Feature intent: backend `orchard,transparent-inputs,pczt`; SQLite
`orchard,transparent-inputs,serde`; PCZT all three pool features and the
builder/finalizer/prover/signer/extractor roles; primitives circuits and proofs
included. Default features are disabled on direct Common/wallet edges, with
required features explicitly added. Features are additive: e.g. the backend's
defaults reappear transitively, while Rayon remains unconditional. Internal
`orchard` features do not establish Ironwood runtime support.

Randomness source audit: getrandom 0.2.17 already has `js` from existing edges;
getrandom 0.4.3 required `wasm_js`; UUID 1.26.1 separately required `js`.
Those target-only additions select WebCrypto-backed paths in inspected source;
they were not exercised by a wasm runtime. `rand` 0.10.2 and `rand_core` 0.10.1
plus 0.6.4 are present. The deterministic pairing fixture consumes no entropy,
so even native success does not qualify cryptographic randomness delivery.

## Failure sequence and dispositions

1. The initial sandbox blocked DNS and the snap `gh` launcher failed. The cache
   was incomplete/mixed. These were local environment failures, **not upstream
   unavailability**. After the coordinator enabled scoped network/filesystem
   access, actual git/curl fetches succeeded. Previously retained evidence files
   were adopted and verified byte-for-byte against the fetched sources; no
   reconstructed lockfile is used as evidence.
2. `wasm-initial` failed in getrandom 0.4.3: enable `wasm_js`. Added only that
   target feature, retaining every package version.
3. `wasm-js-rng` failed because `clang` was missing. Fetched the pinned SDK.
4. `wasm-clang` failed because SQLite could not include `stdio.h` for the
   unknown-unknown target. The first header diagnostic (`wasm-c-diagnostic`)
   failed with `<wasi/api.h> is only supported on WASI platforms`.
5. The next C diagnostic explicitly used `--target=wasm32-wasi` and the SDK
   sysroot, `SQLITE_OS_OTHER=1`, `SQLITE_THREADSAFE=0`, `SQLITE_TEMP_STORE=3`,
   `SQLITE_OMIT_LOAD_EXTENSION=1`. Rust stayed unknown-unknown. This configuration
   applies to the target C builds, including secp256k1; it is not a browser ABI
   result. No fake `__wasi__` macro or replacement C backend was introduced.
6. `wasm-wasi-c` reached UUID's independent RNG-selection error. Adding UUID
   `js` (same version) yielded the successful `wasm-uuid-js` check.
7. `wasm-link` failed on libc names and `sqlite3_os_init`. Adding the actual
   pinned WASI `libc.a` only to the consumer link left `sqlite3_os_init` alone.
   No dummy initializer, ignored symbols, fake imports or replacement crypto was
   used to manufacture a link/runtime success.

The remaining concrete work is to provide and qualify the SQLite OS/VFS
registration in the same SQLite instance, along with a coherent C libc/allocator
and Rust linear-memory ABI. A zero-return initializer would not supply a usable
VFS or settle this boundary. Node filesystem and browser OPFS implementations,
final module import/memory inspection, generated glue and actual worker
instantiation are subsequent real gates. Scanner liveness and storage/threaded
acceptance remain separate, as required by D07/F1–F8.

## Reproduction and retained commands

[README](README.md) gives the executed final recipe. The [command index](evidence/commands.jsonl)
records exact argv, exit codes, log paths and SHA-256 digests for fetches, builds,
audits and the repeat. Initial commands used sourced `cargo-env.sh`; their early
records predate explicit environment capture, but C failures retain exact C
commands. The final repeat records include the complete selected environment.
No build timed out; all builds were bounded at 900 seconds with two jobs.

| Final repeat label | Exit | Full log SHA-256 |
| --- | --- | --- |
| `repeat-native` | 0 | `4abef8270e484eaccf53d7bcba0d402b801e5fca027f10d882de70a92f7087e5` |
| `repeat-wasm-check` | 0 | `22e0df986057b9ba5be07526ac5fb348862a3dedef42108383cc3e088acbb889` |
| `repeat-wasm-link` | 101 | `12a04d66492f71a81bb3881b972c3f2308cc5ee84eae106b3b3366c764cd3384` |
| `repeat-wasm-libc-diagnostic` | 101 | `5ffc64b04235aac2c7b1199f667025fa1ce1737b395c0d635d96ca9986fe6655` |

Harness TDD: `python3 -m unittest discover -s qualification -p test_harness.py`
first failed (exit 1, missing harness module), log `tdd-red.log`, SHA-256
`aa2cf7bc4c4d992259ba7abe4c5c304fb148b0580985fa87b62eb92f9d856d34`.
After implementation, three tests pass for nonzero exit/log-digest retention,
timeout termination and rejection of missing/mixed/upstream crypto graphs. The
final `repeat-tests` exit is 0 and its digest is
`2885f984f7b7e9d40db78b082087af9808a87140b90876b114533743306b9e64`.
These tests qualify harness behavior only.

Full logs and binaries remain outside the tracked tree. All executed fixture
data is synthetic; no keys, wallet records or live endpoints were used. No
blockchain/provider access, funds, mining, deployment, publication, license
selection, GitHub writes or deferred #10–12 work occurred.

## Review fixes — harness scope only

The initial review fixes enforced the exact consumer exemption and unconditional
integrity checks. Rereview found that metadata and artifact provenance remained
incomplete: current source hashes could accompany stale metadata, and the last
artifact snapshot did not establish build producers. The earlier claim that all
three findings were corrected was premature. The cycle 2 validation below
supersedes that claim; the original checks and logs below remain historical.

The tracked `evidence/` files are deliberately unchanged historical evidence.
Their source checksum list describes the pre-review harness, not these corrected
scripts. No current successful build/run is asserted or manufactured. New audits
below recheck retained metadata against local registry archives; they are not a
new Cargo resolution, native execution, wasm check or link attempt.

TDD reproduced each bug before its fix (`python3 -m unittest discover -s
qualification -p test_review.py`, exit 1): four provenance bypass cases, six
optimized integrity cases, and four stale/legacy collection cases. Red logs are
`/home/jack/zcash-qualification-logs/fix-p2-{1,2,3}-red.log`.
The final checks, from the repository root, were:

```sh
python3 -m unittest discover -s qualification -p 'test*.py'
PYTHONOPTIMIZE=1 python3 -m unittest discover -s qualification -p 'test*.py'
python3 qualification/verify_sources.py
PYTHONOPTIMIZE=1 python3 qualification/verify_sources.py
CARGO_HOME=/home/jack/zcash-qualification-scratch/cargo python3 qualification/audit.py /home/jack/zcash-qualification-logs/repeat-metadata-x86_64-unknown-linux-gnu-1789102822385103078.log
CARGO_HOME=/home/jack/zcash-qualification-scratch/cargo python3 qualification/audit.py /home/jack/zcash-qualification-logs/repeat-metadata-wasm32-unknown-unknown-1789102824485918080.log
git diff --check
```

All exit 0. Both test modes pass eight tests, including synthetic collection
success and rejection before writes for source, lock, audit/command run, artifact,
log and failed-audit mismatches, plus command fingerprint capture. Verification
matches all four retained source files and the SDK archive. Audits retain
236 native / 240 wasm packages and the unchanged consumer lock hash above.
Logs are `fix-final-tests.log`, `fix-final-optimized.log`,
`fix-source-verification.log`, `fix-optimized-sources.log`,
`fix-native-audit.json` and `fix-wasm-audit.json` in the external logs directory.

Issue #2 remains open at the previously observed SQLite OS/VFS and libc/ABI
boundary. Runtime, storage, scanners, threading and protocol/proofs remain
unqualified. The initial harness corrections did not supply a bound run. Cycle 2 retains its
fresh run separately, preserving the tracked historical evidence.

## Review-fix cycle 2 — fresh offline validation

Changes are confined to qualification scripts, tests and documentation. The
metadata audit now requires the same-run producing command, exact offline argv,
platform, input log SHA-256 and matching before/after source fingerprints before
printing audited evidence. Collection rechecks that binding. The complete ordered
stage inventory is mandatory. Builds use a new, initially absent target directory
named by the run ID. Cargo JSON artifact and build-script messages identify actual
output paths; collection checks their hashes and effective target directory.
Required missing outputs reject collection. A Cargo exit 101 with an observed
linker error and failed build completion allows explicit final-WASM absence;
a successful link requires its reported final WASM. No artifact bytes are invented.
Collection refuses to overwrite retained evidence.

Tests-first commit `2acfcb3` precedes implementation `9bb285a`. The initial three
regressions exited 1 (one assertion failure and nine missing-API subtest errors).
The final suite passes 12 tests normally and optimized, including complete
synthetic collection and rejection before writes for stale metadata binding,
changed manifest fingerprints, wrong metadata target, audits-only inventory,
historical target reuse, missing outputs, wrong target paths and altered binaries.
Final-WASM presence and explicit failed-link absence are separately exercised.

A separate actual offline Cargo reproduction in scratch removed UUID's `js`
feature: fresh metadata dropped `js`, while the unchanged old metadata retained it.
Auditing that old input under the changed manifest exited 1; labeling genuine wasm
metadata as native also exited 1. See `cycle2-metadata-repro.log` and the runnable
`/home/jack/zcash-qualification-scratch/cycle2-metadata-repro.py`.

The fresh full run is `c9e00fb500584650ab482a01487cbbb4`, executed from this
worktree using:

```sh
source qualification/cargo-env.sh
source qualification/wasi-diagnostic-env.sh
python3 qualification/run_slice.py
```

Overall exit: **101**. Tests, source verification, native command, both metadata
commands, both audits, both feature inventories and the diagnostic wasm check
exit 0. The final link and WASI-libc diagnostic both exit 101; the latter reports
`sqlite3_os_init` as its sole undefined symbol. Neither produces the final module.
No stage timed out. These are bounded command outcomes, not production, browser,
Node, storage, scanner, threading or protocol/proof qualification.

| Fresh stage | Exit | Log SHA-256 |
| --- | --- | --- |
| `repeat-tests` | 0 | `ff3bf96db7ee70948197ff847ef2c07adf578e3a0229509429dc2f0a74f75c33` |
| `repeat-sources` | 0 | `bd2c6c08ce472d6b7c5e6ecaeadc232b2f376477ee4619acc0ca7498c75a8fd5` |
| `repeat-native` | 0 | `6e8a405b5155d5f97db2175735c90671e96d3e045b27ec10cb67485ac87ae82d` |
| `repeat-metadata-x86_64-unknown-linux-gnu` | 0 | `e021db8a00913598a9911496b2ffdc2bcf3b95e515f1eed9578785e4df65de8c` |
| `repeat-audit-x86_64-unknown-linux-gnu` | 0 | `1a42ae7099806d655b2102de211532ad48baa83685713e60b666db8bfa263318` |
| `repeat-features-x86_64-unknown-linux-gnu` | 0 | `ebef9e0094d927f39fa4873cb8cb1daed50d99edb690494c798e71effd6f41e3` |
| `repeat-metadata-wasm32-unknown-unknown` | 0 | `b263702c7451dc68ab371694c4a9d5f312ca18b2b31155abe59e82b9d64a78a7` |
| `repeat-audit-wasm32-unknown-unknown` | 0 | `1390d47896f54bdb764a3d56a6d0fc75a870c22490ae6c7ccccc48810be4faf4` |
| `repeat-features-wasm32-unknown-unknown` | 0 | `63fb25c07eb15b5d0475b2fcd20901c8980c0d15adaac338669cbd9f7d376c6c` |
| `repeat-wasm-check` | 0 | `4498177566615a0ac9207eabe501e0e38278026768d61bc212d0335050719d8d` |
| `repeat-wasm-link` | 101 | `496913977910c647329c7dfb707cf53470b24156974b54d5f02155a0cf365e05` |
| `repeat-wasm-libc-diagnostic` | 101 | `9fb34c4476b8a0deabab8a8dc9c98a17f7b3c692b49938627e64aa292fbc4de0` |

Collection exits 0 and retains all 12 records in
`/home/jack/zcash-qualification-logs/cycle2-evidence-c9e00fb500584650ab482a01487cbbb4`.
It retains 236 native / 240 wasm packages and 1,733 artifact-stage records,
including two explicit failed-link absence records. The output preserves each
artifact's producing log and its hash. Exact command:

```sh
QUALIFICATION_RUN_ID=c9e00fb500584650ab482a01487cbbb4 \
QUALIFICATION_OUTPUT=/home/jack/zcash-qualification-logs/cycle2-evidence-c9e00fb500584650ab482a01487cbbb4 \
python3 qualification/collect_evidence.py
```

The tracked `evidence/` files remain byte-for-byte unchanged. The earlier run
`213df4311f7546ed95de6bf0b902e062` was not relabeled for the new source.
Additional validation commands (each exit 0):

```sh
python3 -m unittest discover -s qualification -p 'test*.py'
PYTHONOPTIMIZE=1 python3 -m unittest discover -s qualification -p 'test*.py'
PYTHONOPTIMIZE=1 python3 qualification/verify_sources.py
python3 /home/jack/zcash-qualification-scratch/cycle2-metadata-repro.py
git diff --check
```

Selected external log identities:

| Log | SHA-256 |
| --- | --- |
| `cycle2-red-confirmed.log` | `05b8d87f43a2fd62d1326b8c28e83b694d81d8237622d21d417274a45ce8b49e` |
| `cycle2-tests.log` | `bc3d73f5d322e5f82540f6b5760690d19f37e97de6cbe38124268aac89a643b3` |
| `cycle2-optimized.log` | `4f8e1c236c37a39fcee57bde59876dee686d8aa1c8cbfc9b51fca9fbea6c01ee` |
| `cycle2-metadata-repro.log` | `7973189fd50e1aac9b3a930b45f73c776c59d0ad96e22a80e56deab46928c276` |
| `cycle2-collect.log` | `1b4d8ece81efb9213a9a373c440d636555e6cc28b4299228e75338be12f187cb` |
| `cycle2-fresh-run.log` | `6eee371d667d1bbd5ac07f16f25c34bed71b4761a71d7ad63cf8c5c6ca60b901` |
| `cycle2-sources-optimized.log` | `bd2c6c08ce472d6b7c5e6ecaeadc232b2f376477ee4619acc0ca7498c75a8fd5` |

Optimized collection also exits 0 with byte-identical outputs, using the same
command with `python3 -O` and output directory
`/home/jack/zcash-qualification-logs/cycle2-evidence-optimized-c9e00fb500584650ab482a01487cbbb4`.
Log: `cycle2-collect-optimized.log`, SHA-256
`1b4d8ece81efb9213a9a373c440d636555e6cc28b4299228e75338be12f187cb`.
