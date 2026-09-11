# Executed runtime commands

Historical directory failure: [preflight commands](preflight/commands.md).

Every command below ran from `/home/jack/zcash-worktrees/node-runtime` after
`source qualification/runtime/env.sh`, using the existing read-only recorder.
Full logs and the original JSONL index remain in `/home/jack/zcash-node-runtime-logs`.
The recorder omits `LIBSQLITE3_FLAGS` and `TMPDIR` from its environment subset;
their exact values are retained in the committed, hashed `env.sh`.
Builds used two jobs and 900-second limits; none timed out.
The coordinator receipt is separate evidence, not one of these worker commands.

## fetch-bindgen: exit 6

Started `2026-09-11T05:17:06.120698+00:00`; timeout 120.0 seconds.

Exact argv (JSON, preserving argument boundaries):

```json
["curl", "--fail", "--location", "--connect-timeout", "15", "--max-time", "100", "--output", "/home/jack/zcash-node-runtime-scratch/wasm-bindgen-0.2.128.tar.gz", "https://github.com/wasm-bindgen/wasm-bindgen/releases/download/0.2.128/wasm-bindgen-0.2.128-x86_64-unknown-linux-musl.tar.gz"]
```

Log: `/home/jack/zcash-node-runtime-logs/fetch-bindgen-1789103826120686656.log`
SHA-256: `b116f80e5933f85bd5ea38163a47ea726ef7c7f6987dd263f1a8acde5c48c96b`

## red-link: exit 101

Started `2026-09-11T05:17:04.950998+00:00`; timeout 900.0 seconds.

Exact argv (JSON, preserving argument boundaries):

```json
["cargo", "build", "--offline", "--locked", "--manifest-path", "qualification/runtime/Cargo.toml", "--target", "wasm32-unknown-unknown", "--lib"]
```

Log: `/home/jack/zcash-node-runtime-logs/red-link-1789103824950988602.log`
SHA-256: `8d95183cce2331a4c4a37bee14041f06a8801f02918ffaed0e435028f98e2c3f`

## red-runtime: exit 1

Started `2026-09-11T05:18:39.149185+00:00`; timeout 120.0 seconds.

Exact argv (JSON, preserving argument boundaries):

```json
["node", "--test", "qualification/runtime/test-runtime.cjs"]
```

Log: `/home/jack/zcash-node-runtime-logs/red-runtime-1789103919149176200.log`
SHA-256: `b92c4f2778fa4e412d1abb265c13c0492b70e125bd454727ee247acfb7669a75`

## adapter-link: exit 0

Started `2026-09-11T05:22:56.670995+00:00`; timeout 900.0 seconds.

Exact argv (JSON, preserving argument boundaries):

```json
["cargo", "build", "--offline", "--locked", "--manifest-path", "qualification/runtime/Cargo.toml", "--target", "wasm32-unknown-unknown", "--lib"]
```

Log: `/home/jack/zcash-node-runtime-logs/adapter-link-1789104176670984735.log`
SHA-256: `80aff029788366f84138f355afd2d28eb1c806466ccacbe53592a2825b8281e1`

## inspect-imports: exit 0

Started `2026-09-11T05:23:11.145176+00:00`; timeout 120.0 seconds.

Exact argv (JSON, preserving argument boundaries):

```json
["node", "-e", "const fs=require(\"fs\");const m=new WebAssembly.Module(fs.readFileSync(process.argv[1]));console.log(JSON.stringify({imports:WebAssembly.Module.imports(m),exports:WebAssembly.Module.exports(m)},null,2))", "/home/jack/zcash-node-runtime-scratch/target/wasm32-unknown-unknown/debug/issue_2_qualification.wasm"]
```

Log: `/home/jack/zcash-node-runtime-logs/inspect-imports-1789104191145167001.log`
SHA-256: `c4f2a6bf72508acd7eeacd7c7016933e73f6e89937bcae436c61d6d43f7ff45b`

## node-first: exit 1

Started `2026-09-11T05:23:11.251597+00:00`; timeout 120.0 seconds.

Exact argv (JSON, preserving argument boundaries):

```json
["node", "qualification/runtime/test-runtime.cjs"]
```

Log: `/home/jack/zcash-node-runtime-logs/node-first-1789104191251585727.log`
SHA-256: `6fdeb2c3241f7226070db2c7ab1440dc2657b78c0c216974ea5cf26f7d2f0d64`

## offline-bindgen: exit 101

Started `2026-09-11T05:23:33.365153+00:00`; timeout 120.0 seconds.

Exact argv (JSON, preserving argument boundaries):

```json
["cargo", "install", "--offline", "--locked", "wasm-bindgen-cli", "--version", "0.2.128", "--root", "/home/jack/zcash-node-runtime-scratch/bindgen-tools"]
```

Log: `/home/jack/zcash-node-runtime-logs/offline-bindgen-1789104213365142922.log`
SHA-256: `e0c9c01c3c31fa07861e8bbc38e1ab8303d973ff62d0427ea458ea6cf9398e6f`

## metadata: exit 0

Started `2026-09-11T05:23:55.366911+00:00`; timeout 120.0 seconds.

Exact argv (JSON, preserving argument boundaries):

```json
["cargo", "metadata", "--offline", "--locked", "--manifest-path", "qualification/runtime/Cargo.toml", "--filter-platform", "wasm32-unknown-unknown", "--format-version", "1"]
```

Log: `/home/jack/zcash-node-runtime-logs/metadata-1789104235366901833.log`
SHA-256: `1dcee9c96dba93d1ae1cdae4fbf629e228c6080c9eb7b3fe98d2c33ad0f66f38`

## features: exit 0

Started `2026-09-11T05:23:55.571344+00:00`; timeout 120.0 seconds.

Exact argv (JSON, preserving argument boundaries):

```json
["cargo", "tree", "--offline", "--locked", "--manifest-path", "qualification/runtime/Cargo.toml", "--target", "wasm32-unknown-unknown", "-e", "features"]
```

Log: `/home/jack/zcash-node-runtime-logs/features-1789104235571335673.log`
SHA-256: `22094147fdecf56818932b4ce7cd44da1e96ac00817e8d4d43ba1b4172b17bd2`

## disassemble: exit 0

Started `2026-09-11T05:23:54.204839+00:00`; timeout 120.0 seconds.

Exact argv (JSON, preserving argument boundaries):

```json
["/home/jack/zcash-qualification-scratch/wasi-sdk-27.0-x86_64-linux/bin/llvm-objdump", "-d", "/home/jack/zcash-node-runtime-scratch/target/wasm32-unknown-unknown/debug/issue_2_qualification.wasm"]
```

Log: `/home/jack/zcash-node-runtime-logs/disassemble-1789104234204830757.log`
SHA-256: `2ee3e112eb05209dd6139a825282d1d3c1c78e0a8af44885dc3490f7f06e6679`

## symbols: exit 0

Started `2026-09-11T05:23:56.228790+00:00`; timeout 120.0 seconds.

Exact argv (JSON, preserving argument boundaries):

```json
["/home/jack/zcash-qualification-scratch/wasi-sdk-27.0-x86_64-linux/bin/llvm-nm", "--defined-only", "/home/jack/zcash-node-runtime-scratch/target/wasm32-unknown-unknown/debug/issue_2_qualification.wasm"]
```

Log: `/home/jack/zcash-node-runtime-logs/symbols-1789104236228776704.log`
SHA-256: `88d5c4f421453df16504ffe2c97485f37e38bf0233582e0c45052ee27e3cb722`

## graph-audit: exit 0

Started `2026-09-11T05:24:12.851012+00:00`; timeout 120 seconds.

Exact argv (JSON, preserving argument boundaries):

```json
["python3", "qualification/audit.py", "/home/jack/zcash-node-runtime-logs/metadata-1789104235366901833.log"]
```

Log: `/home/jack/zcash-node-runtime-logs/graph-audit-1789104252851002937.log`
SHA-256: `40596f67031d6cec087bca8d3bca07dcad09d6a8df68ab433071db2ec390edcc`

## fetch-bindgen-cargo: exit 101

Started `2026-09-11T05:24:43.717058+00:00`; timeout 120.0 seconds.

Exact argv (JSON, preserving argument boundaries):

```json
["cargo", "install", "--locked", "wasm-bindgen-cli", "--version", "0.2.128", "--root", "/home/jack/zcash-node-runtime-scratch/bindgen-tools"]
```

Log: `/home/jack/zcash-node-runtime-logs/fetch-bindgen-cargo-1789104283717049300.log`
SHA-256: `ddc66b11ec246e2dd8e37d85d259e481263ca97aa453a0c10016b16a970d1c14`

## artifact-inspection: exit 0

Started `2026-09-11T05:26:26.339001+00:00`; timeout 120.0 seconds.

Exact argv (JSON, preserving argument boundaries):

```json
["python3", "qualification/runtime/inspect.py"]
```

Log: `/home/jack/zcash-node-runtime-logs/artifact-inspection-1789104386338989798.log`
SHA-256: `1ca4311314a2a67f2d918450b3087736aaa2f28e9645af6c2ce1cadeed210dc6`

## final-artifact-inspection: exit 0

Started `2026-09-11T05:27:08.601134+00:00`; timeout 120.0 seconds.

Exact argv (JSON, preserving argument boundaries):

```json
["python3", "qualification/runtime/inspect.py"]
```

Log: `/home/jack/zcash-node-runtime-logs/final-artifact-inspection-1789104428601117994.log`
SHA-256: `f6354b9a4e70d9ca4c9ef4dc2e70b791ee2cb6e7853e9d9d627d16219a86da1d`

## toolchain: exit 0

Started `2026-09-11T05:27:10.509037+00:00`; timeout 60.0 seconds.

Exact argv (JSON, preserving argument boundaries):

```json
["bash", "-c", "rustc -Vv; cargo -V; node --version; \"$runtime_sdk/bin/clang\" --version; \"$runtime_sdk/bin/wasm-ld\" --version; sha256sum qualification/runtime/env.sh qualification/runtime/Cargo.toml qualification/runtime/Cargo.lock"]
```

Log: `/home/jack/zcash-node-runtime-logs/toolchain-1789104430509026148.log`
SHA-256: `052a44606318e0e88f2f2df0dc161b53f62684153f91c8280e619ae5eee596c3`

## syntax: exit 0

Started `2026-09-11T05:27:10.665112+00:00`; timeout 60.0 seconds.

Exact argv (JSON, preserving argument boundaries):

```json
["node", "--check", "qualification/runtime/test-runtime.cjs"]
```

Log: `/home/jack/zcash-node-runtime-logs/syntax-1789104430665100403.log`
SHA-256: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`

The initial cache copy used `cp -a /home/jack/zcash-qualification-scratch/cargo/. /home/jack/zcash-node-runtime-scratch/cargo/` (exit 0).
No hardlink option was used. The runtime manifest/lock were copied byte-for-byte from the consumer.
The module and linker map were copied to `scratch/stages/adapter-link/` before final inspection (exit 0).
These setup commands were observed through the terminal but not the command recorder.

## Final documentation verification

`git diff --cached --check` exited 0. A terminal Python check verified final newlines, absence of trailing whitespace/NULs in every runtime text file, and byte-identical runtime/consumer manifests and locks (exit 0). `git diff e270ac0 --name-only` confirmed every changed path is under `qualification/runtime/` (exit 0). These final terminal checks were not recorded as external log artifacts.
