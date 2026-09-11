# Transaction codec qualification

Disposable issue #33 / #3 F8 consumer, feeding #6's exact-byte transaction identity prerequisite. Uses published Common **1.0.0**, genuine `Transaction::{read,write,txid}`, and wasm-bindgen **0.2.128**. No production exports or backend fork. See [REPORT.md](REPORT.md) for scope and [CLIresult.md](CLIresult.md) for executed commands/results.

The fixed 13-vector corpus covers V3/Overwinter, V4/Sapling, ten V5/Nu5 ZIP-244 vectors, and the existing unsigned synthetic V6/Nu6_3 scanner transaction. The standalone source verifier checks fixture bytes, pre-existing expected IDs, and source hashes without fetching anything:

```sh
python3 qualification/transaction-codec/verify-vectors.py
python3 qualification/transaction-codec/test-verifier.py
```

On the assigned qualification host, first copy the accepted Cargo cache if the owned copy does not exist. Do not point Cargo at shared caches or targets:

```sh
cp -a /home/jack/zcash-wallet-integrated-scratch/cargo /home/jack/zcash-transaction-codec-scratch/cargo
mkdir -p /home/jack/zcash-transaction-codec-scratch/tmp
source qualification/transaction-codec/env.sh
cargo test --offline --locked --manifest-path qualification/transaction-codec/Cargo.toml
python3 qualification/transaction-codec/build.py
```

`build.py` snapshots the listed consumer inputs, runs native tests/vectors, links WASM, and invokes the exact approved generator. It prints Node and Firefox commands bound to a read-only bundle and manifest SHA256; run those exact commands. Every build gets a unique directory and log names under `/home/jack/zcash-transaction-codec-logs/fixes`. The runners refuse to overwrite receipts. Node and Firefox import `codec-entry.mjs`, which checks JS u32 and Uint8Array fields before the generated web bindings. Node uses `initSync`; Firefox uses `init` in its actual page realm. Generated files are not patched. Both run the same Rust suite and JS boundary checks. There is no worker, threading, storage, or lifecycle qualification in this consumer.

Firefox uses the installed `/snap/bin/geckodriver`, automatic matching Firefox selection, headless mode, and unchanged sandbox policy. The server binds only `127.0.0.1`, serves a fixed hashed asset map, and sends no COOP/COEP. A socket-denied worker must hand the printed immutable command to the authorized parent; it must not change browser or host confinement.

All dependencies are locked; direct versions are exact. The source-backed choice is `zakura-primitives` with only `std`, without its default circuits/multicore or optional transparent signing feature. The transitive `secp256k1-sys` build uses the accepted read-only SDK Clang/AR. No SQLite adapter, WASI libc linkage, entropy shim, or replacement cryptography is supplied. A successful codec read or matching txid does not establish proof, signature, transaction consensus, activation schedule, or broadcast validity.

The independent R1–R3 fixes reject lossy serialization, unchecked JS narrowing and incomplete/false source provenance. The original coordinator Firefox run passed; the fresh fix bundle still needs coordinator Firefox execution. See the exact immutable command and current native/Node/verifier counts in CLIresult.
