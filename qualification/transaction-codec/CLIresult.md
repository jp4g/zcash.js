# Executed CLI results

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

**Browser: parent host execution required.** This is the exact immutable command already checkpointed after the sandbox listener denial. It uses installed Firefox/geckodriver under unchanged confinement, only a local loopback asset server, no installs or external assets:

```sh
timeout 150s node /home/jack/zcash-transaction-codec-scratch/build-1789148536903203729/bundle/run-browser.mjs d04152fd5c61a2f7c82b590d2f4a0b5c5706ccddadc997c2941021a71a217cc1 /home/jack/zcash-transaction-codec-logs/build-1789148536903203729-browser-host.json
```

Browser execution is not currently recorded as passing. The expected host receipt must identify Firefox version/process, no-SAB page context, the matching immutable manifest, all 13 vector results, and successful session/process/server cleanup. If the output file already exists, inspect it; do not overwrite evidence.

The separate resolved-source check compared ten Common 1.0.0 crate archives with Cargo.lock SHA256 checksums and their 372 packaged files with the copied source tree; all matched. The exact target metadata was produced by `cargo metadata --offline --locked --format-version 1 --filter-platform wasm32-unknown-unknown --manifest-path qualification/transaction-codec/Cargo.toml`; files are `metadata-wasm.json` and `source-verification.json`. The frozen bundle manifests bind artifact/runners to the producing source hashes, including uncommitted-at-build bytes subsequently committed in `f6596d3`.
