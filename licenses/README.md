# Distribution licenses

The project-owned SDK, bindings, C adapter and codec wrappers are licensed under the root MIT [LICENSE](../LICENSE). Third-party code retains the grants and conditions below; the project license does not relicense it.

Keep this directory and the root LICENSE with redistributed JavaScript/WASM artifacts. The runtime manifest describes executable assets; these notices are accompanying distribution files, not executable assets to load into a worker.

- `NATIVE.txt` and `native-sources.json`: all 257 third-party crates from the current wallet producer's Cargo metadata, including conservative host/build/target-only coverage. This also covers every registry package/version in the standalone lightwire and transparent-address locks. It does not claim every listed crate is linked.
- `PLATFORM.txt`: WASI SDK 27.0, wasi-libc, LLVM/compiler-rt and SQLite notices, preserving their MIT, Apache, BSD and LLVM-exception conditions. SQLite's copyright dedication is separate from its Rust wrapper license.
- `RUST-STABLE.html` and `RUST-NIGHTLY.html`: the installed toolchains' complete standard-library copyright documents, including their third-party attributions.
- `CODECS.txt`: the pinned vendored protocol and generated binding/bundler helper notices. Upstream server-product references in COPYING do not add those server dependencies to this SDK.

For dual or multiple grants, the native manifest explicitly records the selected permissive option. The two Zakura packages without their own packaged license files select their declared Apache-2.0 option and reproduce that license from the same fork revision; authors and source identities are retained. The `r-efi` MIT grant and copyright are in its original AUTHORS file. The conjunctive Unicode-3.0 obligation is retained. No LGPL option is selected.

The package now includes the canonical Sapling proving-parameter files. Their provenance and redistribution notices are retained in `SAPLING-PARAMETERS.md`, `SAPLING-PARAMETERS-MIT.txt`, and `SAPLING-PARAMETERS-APACHE.txt`. They load lazily by default; an application may override loading through its `loadAsset` callback. No server executables are distributed. Network-definition bytes are distinct from proving material. Additional applications or documentation-site dependencies require their own applicable notices.

This inventory applies to the retained baseline wallet package and current threaded package03, plus the embedded SDK codecs. It is an engineering license/notice reconciliation, not a change to the dependencies or an authorization to publish. Future dependency or artifact changes require corresponding notice updates.

`NPM.txt` and `npm-sources.json` additionally cover all 33 separately installed runtime npm entries. Their registry tarballs were verified against the lockfile SHA-512 integrity values; their own package notices remain applicable.
