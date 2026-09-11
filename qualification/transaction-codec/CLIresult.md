# R1–R3 fix CLI results

Started clean at `4642c91958160e5a3ca2ba02cc299a66a6d7ac17`. Implementation commit and build source: `93541e03128ffc9b60ff2247d5df21648260d06c`. Only `qualification/transaction-codec` changed. Fresh logs are in `/home/jack/zcash-transaction-codec-logs/fixes`; earlier evidence below remains in its original location. All commands use the owned cache/target via env.sh, offline and locked. No installation, external/provider request, publication, merge, browser launch or confinement change occurred in this fixes lane.

| Command | Result | Fresh log |
|---|---|---|
| `source qualification/transaction-codec/env.sh && cargo test --offline --locked --manifest-path qualification/transaction-codec/Cargo.toml` before fix | exit 101; 3 pass, 2 fail on accepted lossy V4 | `r1-red.log`, `tdd-red.patch` |
| `node /home/jack/zcash-transaction-codec-logs/fixes/r2-red.mjs` | exit 1; shared field regression rejects old glue accepting oversized branch | `r2-red.log` |
| `python3 qualification/transaction-codec/test-verifier.py` before fix | exit 1; 8 false greens among 12 normal/-O controls | `r3-red.json`, `tdd-red-test-verifier.py` |
| Same Cargo test after fix | exit 0; 5 tests pass, 0 fail | `r1-green.log` |
| Same verifier control command after fix | exit 0; all 12 controls behave correctly | `r3-green.json` |
| `python3 qualification/transaction-codec/verify-vectors.py` | exit 0 | `verify-vectors.log` |
| `python3 -O qualification/transaction-codec/verify-vectors.py` | exit 0 | `verify-vectors-optimized.log` |
| `source qualification/transaction-codec/env.sh && python3 qualification/transaction-codec/build.py` | exit 0; native 5 tests, 13 vectors / 1,472 truncated prefixes / R1 negative; genuine WASM relink/generator | `build-command.json`, `build-command.stderr`, `build-1789150718823603619.json` and its command logs |
| Fresh exact Node command below | exit 0; identical Rust suite; 208 adapter calls, 13 reversed-expectation controls | `node-command.log`, `build-1789150718823603619-node.json` |
| Fresh Firefox command below | **PENDING coordinator execution** | Expected `build-1789150718823603619-browser-host.json`; not produced by this lane |

The 208 adapter calls comprise 65 original calls, 91 branch negatives, 39 byte-type negatives and 13 offset byte-view positives. 130 reject before generated glue; 78 reach WASM. `qualify()` is one additional export call with the shared internal Rust suite. The R1 negative is executed within that suite. Baseline/changed-vector controls plus missing-source and three individually false declarations give six verifier cases in each Python mode, 12 total.

Frozen cwd: `/home/jack/zcash-transaction-codec-scratch/build-1789150718823603619/source`. Build receipt records these actual commands, exits and log digests:

```sh
rustc -Vv
cargo -V
/home/jack/zcash-node-runtime-scratch/wasm-bindgen-0.2.128-x86_64-unknown-linux-musl/wasm-bindgen --version
cargo test --offline --locked
cargo run --quiet --offline --locked
cargo build --offline --locked --lib --target wasm32-unknown-unknown
/home/jack/zcash-node-runtime-scratch/wasm-bindgen-0.2.128-x86_64-unknown-linux-musl/wasm-bindgen /home/jack/zcash-transaction-codec-scratch/build-1789150718823603619/codec.raw.wasm --target web --no-typescript --out-name codec --out-dir /home/jack/zcash-transaction-codec-scratch/build-1789150718823603619/bundle
```

Fresh Node command (executed):

```sh
timeout 60s node /home/jack/zcash-transaction-codec-scratch/build-1789150718823603619/bundle/run-node.mjs a2b417f90ff6d9242a265f1dd7067b4ba09ce8089140b0dd4ca44dbc9334b907 /home/jack/zcash-transaction-codec-logs/fixes/build-1789150718823603619-node.json
```

Fresh Firefox command for coordinator (not yet executed; do not reuse the old receipt):

```sh
timeout 150s node /home/jack/zcash-transaction-codec-scratch/build-1789150718823603619/bundle/run-browser.mjs a2b417f90ff6d9242a265f1dd7067b4ba09ce8089140b0dd4ca44dbc9334b907 /home/jack/zcash-transaction-codec-logs/fixes/build-1789150718823603619-browser-host.json
```

Fresh manifest SHA256: `a2b417f90ff6d9242a265f1dd7067b4ba09ce8089140b0dd4ca44dbc9334b907`. Raw WASM: `bcf243dd0b7075627c4e208a3f6df2bb1bfc83ab24b1043d50716bd89117f3ba`. Generated WASM: `67171bd134b7a55b703edd9cfbcad73428ed49012dda706a84f6fdfdb6b10c83`. Unmodified generated JS: `dca39fe84e55b8f92c6780d503a6cf2e8081226d18cd54eb6456f5e27a25d829`. Approved generator executable: `dc9e4f1e03996c26fb8bfedfded73d81120a37251c3f19eb87bb460f1f89a5be`.

Fresh runtime/build versions: Node v26.8.1; rustc 1.98.1 (`48a229ceaefd4985c50990b14116b6d856af0985`, LLVM 22.1.8), Cargo 1.98.1 (`797e8a9bc`), wasm-bindgen 0.2.128, accepted read-only WASI SDK 27 Clang/AR for the existing transitive native dependency. `runtime-provenance.json` records resolved executable paths/digests and Python/platform versions. Build receipt records compiler environment, source hashes and command/log digests. `artifact-checks.json` confirms the exact inventory, all 15 selected source inputs match the producing commit and checkout, bundle/manifest/log digests, read-only files and native/WASM Rust-result equality. This reused cached dependencies with fresh consumer compilation/linking. Reports and verifier scripts are outside the build manifest and remain separately committed source.

Fresh Firefox and independent fix acceptance remain pending. No whole #33/#3/#6 acceptance is claimed.

# Original qualification CLI history

All commands ran from `/home/jack/zcash-worktrees/transaction-codec` unless a frozen source cwd is stated. Logs are under `/home/jack/zcash-transaction-codec-logs`. All Cargo writes used the assigned scratch cache/target via `source qualification/transaction-codec/env.sh`; all builds were offline. No installs, Internet/live-chain requests, shared target writes, push or merge occurred.

Toolchain: rustc 1.98.1 (`48a229cea`, LLVM 22.1.8), Cargo 1.98.1, Node v26.8.1, exact approved `/home/jack/zcash-node-runtime-scratch/wasm-bindgen-0.2.128-x86_64-unknown-linux-musl/wasm-bindgen` reporting 0.2.128. `cargo fmt` is unavailable on both installed toolchains; no component was installed.

| Command | Exit/result | Log |
|---|---|---|
| `cargo check --offline --manifest-path qualification/transaction-codec/Cargo.toml` | 0, dependency-only native control | `probe-native.log` |
| `cargo check --offline --locked --target wasm32-unknown-unknown --manifest-path qualification/transaction-codec/Cargo.toml` before SDK compiler selection | 101, missing Clang prerequisite | `probe-wasm.log` |
| Same target check with accepted SDK Clang/AR in env.sh | 0 | `probe-wasm-sdk.log` |
| `cargo test --offline --locked --manifest-path qualification/transaction-codec/Cargo.toml` at `3c91218` | 101, all three expected real parser boundary tests RED | `tdd-red.log`, exact `tdd-red-lib.rs` |
| Same test command after guards and corpus suite | 0, four tests GREEN | `tdd-green.log` |
| `cargo run --offline --locked --manifest-path qualification/transaction-codec/Cargo.toml` | 0, 13 vectors / 1,472 rejected truncated prefixes | `native.json`, `native-build.log` |
| `python3 qualification/transaction-codec/build.py` | 0, frozen native tests/vectors, real WASM link and approved generator | `build-1789148536903203729.json`, producing `*-native-tests.log`, `*-native.log`, `*-wasm.log`, `*-bindgen.log` |
| Exact Node command below | 0, 13 vectors; 65 decode calls; 13 reversed-order expectation controls | `build-1789148536903203729-node.json` |
| Original coordinator host command below | 0, actual Firefox PASS and cleanup | `coordinator-browser.log`, `build-1789148536903203729-browser-host.json`, `.driver.log` |
| Exact browser runner with output suffix `browser-sandbox.json` | 1, `listen EPERM` on loopback before Firefox launch | `build-1789148536903203729-browser-sandbox.json` |
| `python3 qualification/transaction-codec/verify-vectors.py` and `python3 -O qualification/transaction-codec/verify-vectors.py` | Both 0, exact source/vector/provenance correspondence | Command output: verified 13 source-backed vectors |

`build.py` invokes these commands with cwd `/home/jack/zcash-transaction-codec-scratch/build-1789148536903203729/source` and records argv, cwd, exit code and log SHA256:

```sh
cargo test --offline --locked
cargo run --quiet --offline --locked
cargo build --offline --locked --lib --target wasm32-unknown-unknown
/home/jack/zcash-node-runtime-scratch/wasm-bindgen-0.2.128-x86_64-unknown-linux-musl/wasm-bindgen /home/jack/zcash-transaction-codec-scratch/build-1789148536903203729/codec.raw.wasm --target web --no-typescript --out-name codec --out-dir /home/jack/zcash-transaction-codec-scratch/build-1789148536903203729/bundle
```

Executed **Node** command:

```sh
timeout 60s node /home/jack/zcash-transaction-codec-scratch/build-1789148536903203729/bundle/run-node.mjs d04152fd5c61a2f7c82b590d2f4a0b5c5706ccddadc997c2941021a71a217cc1 /home/jack/zcash-transaction-codec-logs/build-1789148536903203729-node.json
```

**Browser: original coordinator execution PASSED.** This is the original immutable command, executed after the worker sandbox listener denial. It uses installed Firefox/geckodriver under unchanged confinement, only a local loopback asset server, no installs or external assets:

```sh
timeout 150s node /home/jack/zcash-transaction-codec-scratch/build-1789148536903203729/bundle/run-browser.mjs d04152fd5c61a2f7c82b590d2f4a0b5c5706ccddadc997c2941021a71a217cc1 /home/jack/zcash-transaction-codec-logs/build-1789148536903203729-browser-host.json
```

The coordinator receipt and `coordinator-browser.log` record PASS: Firefox 155.0.1, geckodriver 0.37.1, secure page without SAB/isolation, matching manifest, 13 vector results / 65 decode calls, and successful session deletion, driver/browser disappearance and server closure. Driver log records shutdown. This original receipt remains untouched and does not cover the fresh R1–R3 fixes.

The separate resolved-source check compared ten Common 1.0.0 crate archives with Cargo.lock SHA256 checksums and their 372 packaged files with the copied source tree; all matched. The exact target metadata was produced by `cargo metadata --offline --locked --format-version 1 --filter-platform wasm32-unknown-unknown --manifest-path qualification/transaction-codec/Cargo.toml`; files are `metadata-wasm.json` and `source-verification.json`. The frozen bundle manifests bind artifact/runners to the producing source hashes, including uncommitted-at-build bytes subsequently committed in `f6596d3`.
