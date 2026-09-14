# MIT distribution closeout (#115)

The project-owned code is licensed under MIT. The SDK distribution can use that project license while retaining the separate permissive third-party grants and notices in `licenses/`. This is not a claim that third-party Apache/BSD/Unicode code has been relicensed MIT.

## Reconciled inputs

- The 33 non-dev npm lock entries use MIT, Apache-2.0, BSD-3-Clause or ISC. All 33 registry tarballs matched the lockfile SHA-512 integrity value, and complete top-level and nested notices are retained. They are separately installed dependencies (`bundled: []`), not copies of npm build/dev tools shipped inside the SDK. Documentation-site output is not in this npm package.
- All 257 third-party packages in current wallet build03 Cargo metadata are represented by exact version, declared/selected license and notice hashes. Local notice bytes were compared with the checksum-verified registry archives (489 notice files). The inventory intentionally includes host and inactive target dependencies. The standalone lightwire/transparent-address locks add no registry package/version outside this set.
- Missing crate notice filenames were resolved from the published source's exact `.cargo_vcs_info.json` revision. `r-efi` contains the complete MIT grant and copyright in AUTHORS; its LGPL option is not selected. `zakura-client-sqlite` and `zakura-pczt` declare MIT OR Apache-2.0 and use the Apache-2.0 option, with the license text retained from the same fork revision. The Unicode-3.0 conjunctive term remains included. Owned patches and wrappers remain identified separately from upstream packages.
- WASI SDK 27.0's VERSION binds wasi-libc `3f7eb4c7d6ed` and LLVM `87f0227cb601`. The notice bundle retains the actual wasi-libc root and musl/cloudlibc/fts notices, compiler-rt/LLVM license and exceptions, and relevant source copyright/dedication headers. SQLite 3.50.2's source copyright dedication is retained separately from the Rust wrapper license. Both retained Rust toolchains' standard-library copyright documents accompany the package.
- The pinned protocol MIT notices, wasm-bindgen licenses and generated bundler-helper notices are retained. The original lightwalletd COPYING also mentions optional server dependencies; those server components are not shipped here.
- No proving-parameter blob is bundled. The SDK's proving loader obtains assets from the caller's `loadAsset` callback. Those assets are distinct from serialized network definitions. If a downstream distributor bundles proving assets or a documentation website, their additional terms must accompany that separate distribution.

## Distribution behavior

Root LICENSE applies to owned SDK/bindings/C adapter/codec wrappers. The npm package explicitly includes `licenses/`. The native wallet packager copies root LICENSE and `licenses/` beside executable assets; they are not executable-manifest entries. Existing accepted wallet artifacts can be redistributed unchanged with these accompanying files. Keep the notices when rehosting or bundling the runtime.

No dependency versions, executable SDK sources, WASM bytes, worker protocol, Python tooling or publication settings were changed. `private: true` and Cargo `publish = false` remain. No npm or external release was published. Historical inventory observations remain preserved and are superseded by this closeout for these specific retained artifacts. Future dependency/artifact changes need corresponding notice updates.

## Validation

SDK TypeScript/capsule build and native packaging checks passed. The final npm tarball contains root LICENSE and all nine SDK notice/manifest files; all emitted JavaScript matches the accepted SDK build byte-for-byte. Both prepared runtime distributions retain every existing file and executable-manifest hash unchanged and add only LICENSE plus notices. Receipt: `/home/jack/zcash-mit-distribution-scratch/final/receipt.json`; npm tarball SHA-256 `d2af2e68ce271a66ea1f6f4a159246f64722a0b8b24e44fe3f30e7b741614df8`. Independent review of the selected grants, notice mappings, scope and packaging passed. Wallet E2E was not rerun for this license-only change.
