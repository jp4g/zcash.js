# Transaction codec qualification — R1–R3 fixed locally, fresh Firefox pending

Issue #33, child of #3, feeding #6. Branch `test/transaction-codec`, base `fd9b3e3`. R1–R3 fixes start from clean `4642c91958160e5a3ca2ba02cc299a66a6d7ac17` and are committed in `93541e03128ffc9b60ff2247d5df21648260d06c`. Changes are confined to this subtree; original bundles and independent repros are preserved. The independent review found three defects; their local fixes pass native/Node and verifier controls. Fresh Firefox and independent fix acceptance remain pending.

| Layer | Result | Evidence |
|---|---|---|
| Native | **VALIDATED within this scope** | Five tests; R1 lossy V4 rejection; 13 source vectors; exact roundtrip, expected internal/display txid order, 1,472 truncated prefixes, malformed groups/CompactSize, branch/context negatives |
| WASM target compilation | **VALIDATED** | Exact locked graph, `wasm32-unknown-unknown`, unmodified dependency sources |
| WASM final link/generator | **VALIDATED** | Real codec symbols linked; approved wasm-bindgen 0.2.128 generated bindings |
| Node | **VALIDATED within this scope** | Same 13-vector Rust suite including R1; 208 JS adapter calls (78 reach WASM, 130 reject before narrowing); 13 reversed-order expectation controls; unshared memory |
| Browser, original bytes | **PASS within original scope** | Coordinator Firefox 155.0.1 / geckodriver 0.37.1, actual secure page without SAB/isolation, 13 vectors and 65 decode calls; successful cleanup |
| Browser, fresh fixes | **PENDING coordinator execution** | New immutable manifest `a2b417f90ff6d9242a265f1dd7067b4ba09ce8089140b0dd4ca44dbc9334b907`; exact command in CLIresult/checkpoint |
| Source verifier | **PASS focused controls** | 12/12 subprocess cases: baseline, missing source, three false metadata declarations, changed vector bytes, each normal and optimized Python |
| Persistence/host integration | Not part of this consumer | No VFS, database, runtime factory, worker ownership, signing or outbox |

## Independent review fixes

**R1/P1:** after the real `Transaction::write`, `decode` rejects if the serialized bytes differ from the accepted input. The returned txid still comes from the pinned backend. The exact review V4 `valueBalance=1`/no-bundle negative is in the shared native/WASM suite and a dedicated native test. RED: 3 tests passed, 2 failed because that input was accepted. GREEN: all 5 pass, including the shared suite through Node WASM. This is a byte-identity guard, not normalization or a proof/consensus validator.

**R2/P2:** `codec-entry.mjs` is the actual entry imported by both Node and the browser. It requires a primitive integer number in `[0, 0xffffffff]` and an `instanceof Uint8Array` before calling unmodified generated glue. The qualification accepts same-realm Uint8Array views, including nonzero offsets; no general cross-realm ABI is introduced. Existing Rust branch/version validation remains. The shared JS controls exercise every corpus vector with oversized, negative, fractional, string, boxed, NaN and Infinity branches; ordinary arrays, Uint16Array and arrays with every byte increased by 256 reject. Thirteen offset byte-view positive controls retain exact bytes/identity. The RED run against the old frozen real bindings fails at the first oversized branch. Fresh Node passes 208 adapter calls: 65 original, 130 new rejected fields and 13 new valid views. Only 78 calls enter generated WASM; `qualify()` and its internal Rust calls are additional. Thirteen reversed-expectation checks make no extra decode call.

**R3/P2:** the verifier requires exactly six Common and four scanner source entries. Declared Common version/revision must match both the fixed pin and actual packaged Cargo.toml/VCS metadata. Scanner declarations retain the fixed base `fd9b3e3`, and all four scanner files are compared byte-for-byte with Git objects at `fd9b3e3ee2e815ebb16c151e27a85a8021f44550`. The original hash/vector checks remain. `test-verifier.py` copies inputs into owned temporary scratch and reads existing Git objects without mutating the repository. Baseline and changed-vector controls behaved correctly before the fix; missing-source and three individually false metadata declarations were false greens in both Python modes. After the fix, all 12 cases have their expected result. No Python `assert` is relied on.

Fresh build `build-1789150718823603619` used committed implementation bytes, the existing owned offline Cargo cache/target and unchanged dependency lock. This was a fresh consumer native compile and WASM relink, not a clean rebuild of all dependencies. All 15 frozen build inputs match producing commit `93541e03128ffc9b60ff2247d5df21648260d06c`; generated JS glue is byte-identical to the original generator output, while the WASM bytes changed. Native and Node Rust suite results match exactly. Verifier scripts and reports are reviewed separately from the 15 build inputs.

The prior `coordinator-browser.log`, `build-1789148536903203729-browser-host.json` and driver shutdown log establish an actual successful original Firefox run with session deletion, driver/browser disappearance and server closure. The prior manifest is `d04152fd5c61a2f7c82b590d2f4a0b5c5706ccddadc997c2941021a71a217cc1`. That result does not qualify the fresh R1/R2 bytes. This fixes lane did not launch Firefox or attempt a socket/confinement workaround. The fresh command is ready for the coordinator; no fresh browser acceptance is asserted.

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

Commit `3c91218` retains three meaningful RED tests against real unguarded `Transaction::read`; all three failed because the parser accepted the input. The original GREEN implementation added these boundary checks; R1 now adds the post-write guard described above:

1. Require the reader to consume every supplied byte. The underlying stream parser accepts a transaction followed by an extra byte and returns the original txid; the consumer rejects the suffix.
2. Require the decoded branch to equal the supplied context. For V5/V6 the parser reads the embedded branch and ignores its caller argument. A caller argument alone is not context validation.
3. Require `TxVersion::valid_in_branch`. A V6 transaction with an embedded known Nu5 branch parses but is rejected by this version/context check.

The same compiled Rust suite runs natively and through WASM: exact roundtrips and expected txids for every vector; 1,472 truncated prefixes (all prefixes below 128 bytes, midpoint and final-byte removal, deduplicated); unknown version groups; noncanonical/over-limit CompactSize counts; unknown embedded and supplied branches; incompatible contexts; and stream-versus-exact-byte controls. The shared JS case module now enters through the checked adapter, retaining every original valid vector and four decode rejection cases each, plus reversed expected ID controls and the new R2 field cases. No toy parser or substitute hash implementation is used at runtime.

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
| raw linked WASM | `bcf243dd0b7075627c4e208a3f6df2bb1bfc83ab24b1043d50716bd89117f3ba` |
| generated WASM | `67171bd134b7a55b703edd9cfbcad73428ed49012dda706a84f6fdfdb6b10c83` |
| immutable fresh bundle manifest | `a2b417f90ff6d9242a265f1dd7067b4ba09ce8089140b0dd4ca44dbc9334b907` |

## Remaining coverage and disposition

Actual Firefox execution passed for the original corpus bundle. Fresh Firefox execution is mandatory for the new fixes and unresolved until the coordinator runs the new exact command and its receipt is inspected. Native/Node success is partial qualification, not a browser substitute. The page runner bounds WebDriver work and owns cleanup of its session, driver, Firefox process and loopback server; it makes no worker-realm lifecycle claim.

Uncovered: full Sprout/version matrices, broader V4/Sapling vectors, nonempty V6 Ironwood bundles and independent V6 txid vectors, V6 shielded proof/signature semantics, activation/network registration, hostile-input resource limits, production Rust/TS authority and ABI, signing/proving, PCZT, mined validity, exact-byte durable outbox/retry, broadcast factories and live transport. No proof asset was needed for the selected codec vectors; absent assets would block only their specific additional vectors. No whole #3/F8, #6, runtime factory, wallet or consensus gate is declared complete.
