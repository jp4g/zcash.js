# Pinned integration fixtures

These are test inputs, not production SDK assets. They are excluded from the npm
package by its `files` allowlist.

- `lightwire/`: the existing Rust lightwallet protobuf codec, its WASM/JS assets,
  original build receipt, and golden protocol vectors.
- `address/`: the existing Rust transparent-address codec and original build receipt.
- `transaction/`: native transaction codec and its original hash inventory and vectors.
- `wallet/`: native wallet bridge assets, original build receipt, and persistence fixture.
- `capsule-build/`: historical generator and dependency lockfile matching the
  committed production codec receipts; they are provenance, not active build inputs.
- `block-one.snap`: the upstream block snapshot used by public block tests.
- `lightwalletd-service.go`: pinned upstream source used by the existing
  source-derived backend-error regression test; the test does not execute Go.

`manifest.json` records source revisions and SHA-256 hashes. Native artifacts are
also checked against their original build receipts before their loaders are
imported. Every fixture is verified by the normal test command.

The original receipts contain historical toolchain paths as provenance. Tests
never resolve those paths and do not require their original workspaces. Runtime
fixture verification checks the committed artifact bytes; it does not rebuild
Rust or independently re-establish the historical source-to-binary build proof.

To update a codec, build the intended pinned revision in the source repository
identified in the manifest using its build instructions. Replace the complete
artifact set and receipt together, verify their hashes, and update the manifest
and golden vectors deliberately. Do not substitute a mock codec or silently
refresh a binary from the network. The source repositories retain their build
toolchain and dependency requirements; ordinary SDK tests need none of them.
