# Bounded G4 network parameters component

2026-09-11. Implementation complete within the assigned paths; **Firefox host
execution and independent HIGH review remain pending**. This is a proposed
implemented format under existing #4 feeding #6, not G4 acceptance or a public
factory. No issue, push, merge, publication, subagent, live provider or funds action.

Base: `fd9b3e3ee2e815ebb16c151e27a85a8021f44550`, branch `feat/network-parameters`.
Implementation commits: `0c28b8b` (internal parser/binding), `5e3a23d` (real native
and generated WASM qualification), `7bbd89e` (detached-byte error fix, specification,
repeatable checks). Only report/link cleanup follows the last implementation head.
Requested role was HIGH; no independent model-effort attestation is claimed.
Full Ponytail and latest steering/TDD were read. Completed source research at
`/home/jack/.hermes/zcash-client-source-research.md` was consumed without repeating
its broad research lane.

## Delivered scope

- Internal strict `zcash-js-network/1` document parser, owned byte snapshots and
  frozen decoded schedule. No root export or fake `Network` facade.
- Internal equality binding to identity, checked genesis hash, exact format and
  canonical parameter bytes. It is an exact tuple key, not a hash or host authority.
- Private `publish = false` Rust crate with an immutable real `Parameters`
  implementation. Independently parses canonical bytes, uses actual upstream
  `is_nu_active`, `BranchId::for_height`, and every `NetworkConstants` method.
- Shared synthetic vectors and comparison in native, actual generated WASM in
  Node, and a ready real-Firefox fixture runner. No hand-authored binding glue,
  cryptographic algorithms, hardcoded production branch table or mocked backend.
- Minimal normative API-doc section and detailed proposed decision in
  `docs/planning/network-parameters-decision.md`.

The format chooses encoding family and ten explicit optional activation heights.
No activation defaults, arbitrary HRPs/branches, NU7 or Tachyon. Unknown/duplicate/
missing/reordered keys, whitespace/BOM/trailing bytes, invalid UTF-8, escaped or
noncanonical spellings, unsafe integers, descending heights and activation gaps
reject. All-null and equal heights (including 0 and uint32 maximum) are valid.
The version identifier lives in the existing outer `parametersFormat` field.

## Sources and graph

Relevant local pinned source was inspected directly:
`/home/jack/zcash-qualification-scratch/cargo/registry/src/index.crates.io-1949cf8c6b5b557f/zcash_protocol-0.10.6/`.
`consensus.rs` defines Parameters at 398–412, its sealed encoding delegation at
424–474, and stable upgrade/branch ordering at 576–695 and 759–820.
Source revision: `28cf1143f932dae94d8626fc0d26a6c61b08823c`.

The consumer lock, not the wallet's original 0.10.4 lock, selects protocol **0.10.6**.
Common remains 1.0.0 at `f4526b0fa86406589732c8fb3849855fb92c43a2`;
wallet reference remains `a9142ee100b3a563b7d9ba7a8e94201d00ad8154`;
node reference remains `1e36d1bb6a8a9778a1bd316704b9c8cb75182de6`.
No existing manifest, lock, config, public signature or other owner's file changed.
All 17 registry packages in the narrow adapter lock match consumer versions and
checksums. This crate does not claim to reproduce the full wallet/Common runtime.

The isolated registry was copied with `cp -a --reflink=auto` into
`/home/jack/zcash-network-parameters-scratch/cargo/registry`; no download/install
was needed. Every Cargo build uses the owned target/cache, `--offline --locked`
after initial offline lock creation, and at most two Cargo jobs. Real installed
wasm-bindgen **0.2.128** generated unmodified web glue. Toolchain: rustc 1.98.1,
Cargo 1.98.1, Node v26.8.1, TypeScript 6.0.3. No SQLite prerequisite.

## Executed checks and test-first evidence

Logs: `/home/jack/zcash-network-parameters-logs/`.

| Check | Actual result | Evidence |
| --- | --- | --- |
| Initial JS test before implementation | Fails: module missing | `js-red.log` |
| Initial Rust behavioral tests with rejecting parse stub | 2 fail | `native-red.log` |
| Detached-byte test before fix | Fails: raw TypeError instead of SDK validation error | `detached-red.log` |
| Final JS behavioral tests, direct Node invocation | **48 pass**, no skips | `check-final.log` |
| Final native Rust tests | **2 pass** | `check-final.log` |
| Native observations compared to JS parse/source golden | **196 pass** | `check-final.log` |
| Generated real WASM instantiated in Node, exact native parity | **196 pass** | `check-final.log` |
| Source constants regeneration | Exact `cmp` match | `check-final.log` |
| API example TypeScript check | Pass | `docs-typecheck.log` |
| Full docs build in isolated scratch copy | Pass, including dead-link check | `docs-build-final-3.log` |
| Firefox inside worker sandbox | Fails before launch: listener EPERM; cleanup complete | `firefox-1789149910479.json` |
| Parent Firefox run | Awaiting `coordinator-host-result.md` | See frozen command below |
| Independent HIGH review | Not performed by this implementer | Parent review after frozen head |

The 196 parity cases contain 167 valid observations and 29 invalid documents.
Valid schedules cover three encoding families, each upgrade's height−1/height/
height+1, all-null and every unscheduled suffix, all-at-zero and all-at-u32-max.
All parsed heights, active flags, selected numeric branch IDs and twelve encoding
constants must agree. Source golden values are emitted by the pinned crate, and
rebuilding must compare them instead of silently regenerating expected test values.
No deployed main/test schedule is asserted.

`node --test` produced only a file-level summary in this sandbox; the final command
runs the node:test module directly and records all 48 behavioral checks. A Node
spawnSync pipe experiment hung under this sandbox and an isolated probe reported
EPERM despite some output; the owned run was stopped with Ctrl-C. Final native
execution uses explicit regular-file stdin/stdout and completes normally. These
are real executed native observations, not a target check or fixture substitute.
`cargo fmt` is unavailable (cargo-fmt missing); no tool was installed to address it.
The worktree has no node_modules, so initial docs/recovery commands could not
resolve installed packages. A scratch symlink approach failed because Vite writes
its temp config under node_modules (the shared tree is read-only). The successful
docs build used a real `cp -a --reflink=auto` copy of existing node_modules, docs,
package.json, README.md and CONTRIBUTING.md under owned scratch. Initial missing
include failures and the final successful build are preserved separately. No
shared files were changed, dependency fetched, or package/config file edited.
Final exact docs command:

```sh
node /home/jack/zcash-network-parameters-scratch/docs-validation/node_modules/vitepress/bin/vitepress.js build /home/jack/zcash-network-parameters-scratch/docs-validation/docs
```

API example checking used the existing TypeScript binary with
`-p docs/api/examples/tsconfig.json`. The unrelated recovery-spec script's initial
module-resolution failure is not represented as a passing test.

## Reproduction and frozen host action

From this worktree:

```sh
bash qualification/network-parameters/check.sh
node qualification/network-parameters/prepare.mjs /home/jack/zcash-network-parameters-scratch/package-NEW /home/jack/zcash-network-parameters-scratch/web /home/jack/zcash-network-parameters-scratch/native-observations.json
```

`check.sh` contains the exact build/generator/native/Node commands. `prepare.mjs`
requires a new output directory, copying actual compiled JS, generated glue/WASM,
native observations, vectors and the Firefox runner. It writes simple SHA256SUMS;
there is no new evidence-audit framework. Package-1 is historical and preserved.
**Package-2 is the final implementation snapshot at 7bbd89e.**

Parent host command (no installs, only local fixture sockets and owned profile):

```sh
cd /home/jack/zcash-network-parameters-scratch/package-2 && echo 'c57e41474813f87d96323d8c0a8fa73693f46e959a4f7375dbac37f18f65fa29  SHA256SUMS' | sha256sum -c - && sha256sum -c SHA256SUMS && node ./firefox.mjs > /home/jack/zcash-network-parameters-logs/coordinator-firefox-package-2.log 2>&1
```

Parent must record command, actual exit, generated result JSON path/hash and
cleanup in `/home/jack/zcash-network-parameters-logs/coordinator-host-result.md`.
The runner uses installed `/snap/bin/geckodriver`, its matching Firefox, headless
mode and an owned scratch profile; no browser/security overrides. It runs actual
WASM plus JS and compares with native output. The final browser probe additionally
checks byte ownership and detached-input rejection. No Firefox pass is claimed
until this command completes successfully.

| Artifact | SHA-256 |
| --- | --- |
| Unchanged consumer Cargo.lock | `2c9b6faa9ff0b227e992bcc10ffb2127138c0258fce81fd45e223e451bf29d71` |
| Private adapter Cargo.lock | `8fefcdbc644d401b363625de4113e75b7240db04657423bbb451956a886abe8b` |
| Raw release WASM | `e6c9a8fd17aa1f1fa1e258930cfb49f11bb63e977dac44b21af9db3f0c6550ef` |
| Generated adapter.js | `09415ff465df30c001a8eae40c203465ae710536af21cbf86be1d798c0d8d930` |
| Generated adapter_bg.wasm | `b59785ec324b5c7d3754b10a460b68e7270e5b759c25144179202e405685eb32` |
| Native executable | `02449e2d57c75ed3fddb6887df0df65784a2893f3e149ffbcfbb0892fe7243c5` |
| Package-2 SHA256SUMS | `c57e41474813f87d96323d8c0a8fa73693f46e959a4f7375dbac37f18f65fa29` |

## Remaining and explicit limits

Finish actual Firefox execution and independent HIGH review of the frozen head.
Then a separate owner can integrate the existing async `defineNetwork` factory,
secure asset loading, production host dispatch/registration and opaque ownership.
The qualification JSON observation export is private testing code, not a public
wire format or production ABI. Registration must revalidate at the Rust boundary.
The equality binding is not a host token and makes no authenticity claim.

No public or light client, address/transaction codec, wallet, proof, SQLite or
full-runtime acceptance is implied. No light-client genesis requirement changed;
server context alone still cannot establish genesis equality. Source-profile
selection and format decisions are documented engineering choices, pending review,
not tasks sent back to the user. No settled public behavior was relaxed.
