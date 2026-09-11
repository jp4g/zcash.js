# Internal full-node chain reads

Implemented bounded production functions in `src/clients/public-chain-reads.ts`: `getTip(source, args?)` and `getBlockHeader(source, args)`. They use the existing `readRpc` transport and the frozen `ChainTip`/`BlockHeader` DTOs. They are internal module exports only, with no root export, factory, registry, transaction codec, WASM import, or partial object cast to `PublicClient`.

`source` is `{ transport: HttpTransport, sourceId: string }`. Integration must bind the caller's nonblank source label to the same transport configuration. The opaque transport does not expose its label for comparison. The functions snapshot the label and header selector before awaiting transport work. `observedAt` is the host's UTC ISO timestamp after successful validation, not a server timestamp or freshness guarantee. Every returned `raw` owns a new ordinary `ArrayBuffer`; callers may mutate it without affecting later reads.

## Selected source profile

Zakura node v1.4.0, commit **`1e36d1bb6a8a9778a1bd316704b9c8cb75182de6`**, checked directly in `/tmp/zakura-upstream-review`. The inspected source files match that commit. This is a specific JSON-RPC 2.0 source profile; similar zcashd method names do not establish wire compatibility. It does not change the SDK's separate Common/wallet dependency pin.

| Behavior | Pinned source |
| --- | --- |
| Tip: one `getblockchaininfo([])`; return `blocks` with `bestblockhash`, never `headers`/`estimatedheight` or independently queried fields | [methods.rs:1539](https://github.com/zakura-core/zakura/blob/1e36d1bb6a8a9778a1bd316704b9c8cb75182de6/crates/zakura-rpc/src/methods.rs#L1539), [response construction:1648](https://github.com/zakura-core/zakura/blob/1e36d1bb6a8a9778a1bd316704b9c8cb75182de6/crates/zakura-rpc/src/methods.rs#L1648), [DTO:4090](https://github.com/zakura-core/zakura/blob/1e36d1bb6a8a9778a1bd316704b9c8cb75182de6/crates/zakura-rpc/src/methods.rs#L4090) |
| Header: `getblockheader([decimalHeightOrDisplayHash,true])`, then `getblockheader([resolvedHash,false])`; a reorg cannot redirect the second read to another block at that height | [selector and raw/verbose implementation:1998–2123](https://github.com/zakura-core/zakura/blob/1e36d1bb6a8a9778a1bd316704b9c8cb75182de6/crates/zakura-rpc/src/methods.rs#L1998) |
| Verbose `hash`, `height`, signed `time: i64`, required `previousblockhash` (also at genesis) | [BlockHeaderObject:4839](https://github.com/zakura-core/zakura/blob/1e36d1bb6a8a9778a1bd316704b9c8cb75182de6/crates/zakura-rpc/src/methods.rs#L4839) |
| Serialized header: little-endian version, parent, merkle root, commitment, uint32 time, bits, nonce, length-prefixed solution; version is 4 through 2^31−1, including historical non-4 values | [block/serialize.rs:29–125](https://github.com/zakura-core/zakura/blob/1e36d1bb6a8a9778a1bd316704b9c8cb75182de6/crates/zakura-chain/src/block/serialize.rs#L29) |
| Canonical CompactSize; solution is exactly 36 or 1,344 bytes, making raw headers exactly 177 or 1,487 bytes | [compact_size.rs:344](https://github.com/zakura-core/zakura/blob/1e36d1bb6a8a9778a1bd316704b9c8cb75182de6/crates/zakura-chain/src/serialization/compact_size.rs#L344), [equihash.rs:161](https://github.com/zakura-core/zakura/blob/1e36d1bb6a8a9778a1bd316704b9c8cb75182de6/crates/zakura-chain/src/work/equihash.rs#L161), [deserialization:342](https://github.com/zakura-core/zakura/blob/1e36d1bb6a8a9778a1bd316704b9c8cb75182de6/crates/zakura-chain/src/work/equihash.rs#L342) |
| Identity is SHA256d of actual serialized header bytes, reversed for display; serialized parent bytes also reverse for display | [block/hash.rs](https://github.com/zakura-core/zakura/blob/1e36d1bb6a8a9778a1bd316704b9c8cb75182de6/crates/zakura-chain/src/block/hash.rs) |
| Known-network genesis parent is all zero bytes, required rather than nullable | [parameters/genesis.rs](https://github.com/zakura-core/zakura/blob/1e36d1bb6a8a9778a1bd316704b9c8cb75182de6/crates/zakura-chain/src/parameters/genesis.rs) |

Inputs require exactly one own `height` or `hash` property. Heights are uint32 numbers; hashes use the existing lowercase 64-character display-hash validation/brand. Unknown fields and accessor properties reject. JSON numeric tokens are checked losslessly before conversion: integer syntax and a safe range are required; decimal/exponent spellings, numeric strings, overflow, and negative heights reject. The signed verbose time is checked as a safe integer, then must equal the raw uint32 timestamp, so negative and out-of-uint32 timestamps cannot produce a successful DTO.

Only consumed verbose fields are projected and validated; additional node fields are allowed. In particular, network/height-dependent `blockcommitments` representations are not guessed or converted into raw bytes. Raw bytes are always fetched, never reconstructed from JSON. Framing, version, raw digest identity, parent, timestamp, and requested selector are checked before returning. Missing/null/malformed fields, malformed hex, noncanonical solution lengths, trailing bytes, and inconsistent identities fail `PROTOCOL_MISMATCH`. Genesis has the same checks plus its required zero parent.

Native Web Crypto performs two SHA-256 digests over at most 1,487 bytes. Unavailable/failed native hashing fails `RUNTIME_UNAVAILABLE` with a fixed message. Cancellation is checked around each digest; native hashing itself cannot be interrupted. Transport deadlines, byte bounds, read retries, and caller abort behavior remain in `readRpc`. Its timeout is per request attempt, not a new whole-method timeout: a header read has two RPCs plus bounded local parsing/hashing. No additional requests, retry policy, or endpoints are invented.

## Remaining integration and limitations

The coordinator still owns the lazy factory and full protocol/network handshake, binding to a real registered `Network`, and complete `PublicClient` composition. These functions do not perform or claim that handshake, and supply no bypass flag or fake network. Checking genesis parent syntax does not establish the configured genesis identity. Both source-supported solution sizes are parsed; selecting a size appropriate to a network is outside these structural checks.

`getBlockHeader` returns a checked `BlockHeader` or throws. Its successful return is assignable to the frozen public `BlockHeader | null` union, but there is **no qualified null mapping** here. Existing `readRpc` keeps `METHOD_NOT_SUPPORTED` for -32601 and sanitizes other RPC errors to `TRANSPORT_ERROR`, losing their original codes. Missing-block codes, operational failures, and human strings therefore cannot safely distinguish absence. Even a successful JSON `null` is a malformed header response in this profile. No errors become plausible empty data.

Raw hash coherence does not verify height, best-chain membership, Equihash, proof of work, merkle/commitment validity, network activation, or consensus. Height and tip remain source observations. The node can report a genesis fallback when state is unavailable; a tip response is not a synchronization/readiness verdict. Hash pinning preserves identity across a reorg but cannot promise the block remains on the best chain or available for the second request.

## Fixtures and verification

All network tests use synthetic localhost HTTP servers with ephemeral ports. No node/provider/funds are contacted. Fixtures retain exact header prefixes extracted from source block vectors, not headers fabricated from verbose JSON:

- [Mainnet genesis vector](https://github.com/zakura-core/zakura/blob/1e36d1bb6a8a9778a1bd316704b9c8cb75182de6/crates/zakura-test/src/vectors/block-main-0-000-000.txt): 1,487-byte header, display hash `00040fe8ec8471911baa1db1266ea15dd06b4a8a5c453883c000b031973dce08`.
- [Regtest genesis vector](https://github.com/zakura-core/zakura/blob/1e36d1bb6a8a9778a1bd316704b9c8cb75182de6/crates/zakura-chain/src/block/genesis/block-regtest-0-000-000.txt): 177-byte header, display hash `029f11d80ef9765602235e1bc9727e3eb6ba20839319f761fee920d63401e327`. Genesis verbose projections are synthetic, derived from those bytes and the source field mapping.
- [Mainnet height-one vector](https://github.com/zakura-core/zakura/blob/1e36d1bb6a8a9778a1bd316704b9c8cb75182de6/crates/zakura-test/src/vectors/block-main-0-000-001.txt) and [actual verbose RPC snapshot](https://github.com/zakura-core/zakura/blob/1e36d1bb6a8a9778a1bd316704b9c8cb75182de6/crates/zakura-rpc/src/methods/tests/snapshots/get_block_header_height_verbose@mainnet_10.snap). The snapshot's height is 1, despite its `mainnet_10` fixture-set name.

The tests cover exact wire calls, tip coherence, selector/input rejection, raw hash pinning under a simulated reorg, both genesis sizes, numeric/hash/hex/shape/framing/identity failures, DTO byte ownership, source/timestamps, aborts/timeouts, unsupported and other RPC errors, and no root exports/eager WASM. Synthetic mutated headers check permitted non-4 versions and uint32 boundaries without asserting consensus validity.

To respect this lane's five-file write boundary, build output stays in owned scratch:

```sh
npm run build -- --outDir /home/jack/zcash-public-chain-reads-scratch/check/dist
node --test tests/clients/public-chain-reads.test.mjs
node tests/clients/public-chain-reads-browser.mjs
```

`PUBLIC_CHAIN_READS_BUILD` can point the tests at another already-built `dist`. The default is the scratch path above. The executable browser harness uses installed `/snap/bin/geckodriver` with the existing read-only Firefox options helper, serves current compiled modules, and records evidence in `/home/jack/zcash-public-chain-reads-logs`. It does not invoke the old SDK runner's historical source pin. It deletes its own WebDriver session and signals only its identified process group, checking cleanup afterward. No browser installation, sandbox disabling, or TLS override is used.

`npm run build` and `npm run test:sdk` also ran in `/home/jack/zcash-public-chain-reads-scratch/check`, with exact copies of current source, declarations, package/config files and unchanged SDK tests; the existing dependency directory was linked read-only. `TMPDIR` and npm cache were confined to owned scratch. Build passed, adapter tests passed 18/18, and unchanged SDK tests passed 43/43. Installed Firefox 155.0.1 passed 30 checks across 32 localhost RPC requests with native Web Crypto, no eager activity, and verified cleanup. This is local functional evidence against pinned source fixtures, not live provider compatibility, CORS deployment, full-client, or consensus qualification. The external `REPORT.md` records red/green commands, final evidence, and local commit.
