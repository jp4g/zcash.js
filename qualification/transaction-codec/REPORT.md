# Transaction codec qualification — partial, Browser execution pending

Issue #33, child of #3, feeding #6. Branch `test/transaction-codec`, base `fd9b3e3`. Changes are confined to this new subtree; all prior qualification sources, caches and artifacts were read-only. Independent HIGH review remains pending.

| Layer | Result | Evidence |
|---|---|---|
| Native | **VALIDATED within this scope** | Four tests; 13 source vectors; exact roundtrip, expected internal/display txid order, 1,472 truncated prefixes, malformed groups/CompactSize, branch/context negatives |
| WASM target compilation | **VALIDATED** | Exact locked graph, `wasm32-unknown-unknown`, unmodified dependency sources |
| WASM final link/generator | **VALIDATED** | Real codec symbols linked; approved wasm-bindgen 0.2.128 generated bindings |
| Node | **VALIDATED within this scope** | Same 13-vector Rust suite and 65 JS/WASM decode calls; 13 reversed-order expectation rejection controls; unshared memory |
| Browser | **BLOCKED before execution** | Sandbox `listen EPERM` on `127.0.0.1`; Firefox was not launched. Immutable parent host command in CLIresult/checkpoint |
| Persistence/host integration | Not part of this consumer | No VFS, database, runtime factory, worker ownership, signing or outbox |

## Pinned source and graph

Inspected published `zakura-primitives = 1.0.0`, archive SHA256 `5a5c71f57ec127e0429928795354ec3971fc58151603657a4a6f1ffd9f4e0d67`, VCS `f4526b0fa86406589732c8fb3849855fb92c43a2`, `crates/zcash_primitives`. Relevant actual symbols are `src/transaction/mod.rs` `Transaction::read` (735), `write` (958), `txid` (731), and `TxVersion::valid_in_branch` (210). Supplementary Common 1.1.0 citations were not used to establish these APIs.

The direct graph pins `zakura-primitives = 1.0.0` with `default-features=false, features=[std]`, `zcash_protocol = 0.10.6`, `serde = 1.0.229`, `serde_json = 1.0.151`, `hex = 0.4.3`, and WASM-only `wasm-bindgen = 0.2.128`. The lockfile was seeded from the accepted scanner lock and pruned by the new independent consumer. All ten resolved Zakura crates remain 1.0.0. Their 372 packaged files were byte-compared to the cached crate archives after checking the archives against Cargo.lock checksums. Source checks and resolved features are retained in `/home/jack/zcash-transaction-codec-logs/source-verification.json` and `features-wasm.txt`.

This graph contains no client backend, SQLite, PCZT, Rayon, proof crate, circuits feature, or multicore feature. Internal `orchard` codec types are present as required by the pinned library; that is not a change to the public pool model. Existing caches were copied to assigned scratch before Cargo use. Native and WASM controls used a fresh owned target with two jobs. The accepted SDK was required for transitive `secp256k1-sys`; the final module imports only three generated binding functions, no WASI/SQLite/thread/entropy host imports.

## Fixture suitability and expected results

The scanner fixture was inspected before selecting it. Its manifest identifies an **unsigned synthetic V6** transaction; `qualification/scanner/src/tests.rs::transparent_receipt_replay_and_parsed_spend_separate_from_compact` constructs it using `TransactionData::from_parts_v6`, Nu6_3, one transparent input with empty scriptSig, one transparent output, and no shielded bundles. The manifest identifies wallet revision `a9142ee100b3a563b7d9ba7a8e94201d00ad8154` and Common 1.0.0. This consumer imports the immutable bytes/reference from base `fd9b3e3`; it neither regenerates the scanner nor depends on unmerged scanner changes.

Both 101-byte `transparent-spend.bin` and its pre-existing `transparent-reference.json` match the scanner manifest hashes. Exactly one reference transaction row contains those raw bytes; that row supplies the expected internal-order txid. This is frozen same-library historical reference evidence, not an independent V6 hash oracle. It supports byte encoding and identity, not signature/proof/consensus validity. No compact-block fixtures are treated as full transactions.

| Vectors | Context | Expected identity source |
|---|---|---|
| ZIP-143 vector 0 | V3 / Overwinter `0x5ba81b19` | Exact bytes from pinned `tests/data.rs`; Python hashlib SHA256d, matching pinned `zcash_transparent::util::sha256d::HashReader` rule |
| ZIP-243 vector 4 | V4 / Sapling `0x76b809bb` | Same source-backed SHA256d control |
| ZIP-244 vectors 0–9 | V5 / Nu5 `0xc2d6d0b4` | Exact transaction and expected txid arrays from pinned `tests/data.rs::zip_0244` |
| scanner transparent | V6 / Nu6_3 `0x37a5165b` | Existing scanner raw bytes and frozen reference txid |

The pinned source attributes ZIP fixtures to the official Zcash test-vector generators. We consume the packaged immutable copy, without a network request. Synthetic proof/signature-shaped bytes in these vectors are parsed, never proved or validated. Display expectations reverse the 32 internal bytes, matching `zcash_protocol::TxId::{as_hex,Display}`. `verify-vectors.py` independently re-extracts the selected arrays, recomputes the V3/V4 control, checks the scanner reference, and verifies provenance hashes; it passes both normal and optimized Python execution.

## Parser behavior and TDD result

Commit `3c91218` retains three meaningful RED tests against real unguarded `Transaction::read`; all three failed because the parser accepted the input. The GREEN implementation adds only the boundary checks:

1. Require the reader to consume every supplied byte. The underlying stream parser accepts a transaction followed by an extra byte and returns the original txid; the consumer rejects the suffix.
2. Require the decoded branch to equal the supplied context. For V5/V6 the parser reads the embedded branch and ignores its caller argument. A caller argument alone is not context validation.
3. Require `TxVersion::valid_in_branch`. A V6 transaction with an embedded known Nu5 branch parses but is rejected by this version/context check.

The same compiled Rust suite runs natively and through WASM: exact roundtrips and expected txids for every vector; 1,472 truncated prefixes (all prefixes below 128 bytes, midpoint and final-byte removal, deduplicated); unknown version groups; noncanonical/over-limit CompactSize counts; unknown embedded and supplied branches; incompatible contexts; and stream-versus-exact-byte controls. The shared JS case module crosses the generated `Uint8Array` boundary with every valid vector and four decode rejection cases each, plus reversed expected ID controls. No toy parser or substitute hash implementation is used at runtime.

Pre-V5 bytes have no embedded branch ID. A version-compatible but historically wrong caller context cannot be detected from these bytes by this guard. Network identity, height/activation schedules and context registration still require the reviewed network implementation. A txid also does not attest to full authorizing data or consensus validity; V5/V6 identities must not be described as a plain digest of all serialized bytes.

## Source and artifact hashes

Full source hashes are in [fixtures/provenance.json](fixtures/provenance.json); the executed bundle manifest records every selected build and runner input.

| Input/artifact | SHA256 |
|---|---|
| Cargo.lock | `beed71315eb6b8f7188a8c7c3abaf65bda1c9a4d6f639f88f05f6c49eeb0da4c` |
| Common transaction/mod.rs | `e3b2a89ef39bd4581099f9f5db3fcbbe36939a9f1d033a9019ae069f29afa169` |
| Common transaction/txid.rs | `3cf7e5ce386e1270dfaf71f21ea37d1322609311a586301ed2df15f7fb0fac84` |
| Common transaction/tests/data.rs | `97e2a2e8c108f82a0b49b5445bebef001857f3dcd9dfdc3be60e1eaa60b7a2f1` |
| zcash_protocol 0.10.6 src/txid.rs | `7d19917afcf7b8f98fee478e50411673aed1d03883a0691800420bf783ffe02b` |
| vectors.json | `26cb21c3733ff8a57b4c99310cfb73331d6376a80a065513932349b497cfbd74` |
| raw linked WASM | `b51be874a9fd65c0b926fca86760f659035d1483da62f953676fe14b2fcfbc89` |
| generated WASM | `c8a40d08dd6a135d6908d3af0656775f564d2ea4666fb13e35796760236b577d` |
| immutable bundle manifest | `d04152fd5c61a2f7c82b590d2f4a0b5c5706ccddadc997c2941021a71a217cc1` |

## Remaining coverage and disposition

Actual Firefox execution is mandatory and unresolved until the authorized parent runs the exact command and its receipt is inspected. Native/Node success is partial qualification, not a browser substitute. The page runner bounds WebDriver work and owns cleanup of its session, driver, Firefox process and loopback server; it makes no worker-realm lifecycle claim.

Uncovered: full Sprout/version matrices, broader V4/Sapling vectors, nonempty V6 Ironwood bundles and independent V6 txid vectors, V6 shielded proof/signature semantics, activation/network registration, hostile-input resource limits, production Rust/TS authority and ABI, signing/proving, PCZT, mined validity, exact-byte durable outbox/retry, broadcast factories and live transport. No proof asset was needed for the selected codec vectors; absent assets would block only their specific additional vectors. No whole #3/F8, #6, runtime factory, wallet or consensus gate is declared complete.
