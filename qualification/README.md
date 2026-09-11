# Disposable issue #2 qualification

This is a dependency/target experiment, **not the production SDK**. The consumer
has `publish = false`; it adds no root package, exports, dependencies or license.
See [the slice report](REPORT.md) for executed evidence and unpassed gates.

The coherent Common 1.0 consumer executes its native SQLite/crypto control.
The Rust wasm target check passes only with the explicitly diagnostic WASI C
configuration. Final linking fails; Node/browser execution remains unqualified.

From the repository root, using the recorded Rust 1.98.1 installation with
`wasm32-unknown-unknown` installed:

```sh
bash qualification/prepare.sh
source qualification/cargo-env.sh
source qualification/wasi-diagnostic-env.sh
python3 qualification/run_slice.py
python3 qualification/collect_evidence.py
```

`run_slice.py` currently exits **101**, preserving the failed final-link gate.
It runs native before target, audits both resolved graphs and keeps final linking
separate from `cargo check`. It diagnoses the failed link with WASI libc but does
not supply a stub `sqlite3_os_init`, ignore missing symbols or fabricate imports.
If linking later succeeds, runtime qualification still requires separate work.
Preparation and the final recipe were both executed in this slice.

Every build is limited to 900 seconds and two Cargo jobs. Transient files live in
`/home/jack/zcash-qualification-scratch`; full logs live in
`/home/jack/zcash-qualification-logs`. The source checkout is evidence only:
the consumer uses registry dependencies, with no copied workspace or patches.
`prepare.sh` preserves a dirty source checkout by refusing to overwrite it.

`consumer/Cargo.lock` is the resolved consumer lock, including every Common
package pinned to `=1.0.0`. `evidence/wallet-Cargo.lock` is the untouched upstream
reference lock, verified against the actual pinned git checkout. They serve
different purposes; this experiment does not claim identical third-party
resolution to the wallet workspace. Do not regenerate the consumer lock merely
to obtain newer dependencies when reproducing this result.

The command index retains exact argv, exit codes, timeouts, paths and log SHA-256
digests. Final recipe records also retain the selected environment values. The
graph JSONL files contain normalized dependency edges, Cargo metadata features,
MSRVs, registry archive/manifest hashes and VCS coordinates; `cargo tree -e
features` logs are indexed separately. Cargo metadata's features can include
cross-target unification, so do not interpret a filtered metadata node as proof
of a feature being compiled into a particular artifact. Full build logs and
binaries are deliberately outside git.
