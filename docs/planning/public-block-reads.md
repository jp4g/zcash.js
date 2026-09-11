# Internal public block reads (#6)

This slice adds only `src/clients/public-block-reads.ts#getBlock`. It starts from
A `0902602ae38aff2dd825df94c6113d7f6737ce56`, which is **under review, not accepted**.
Parent must integrate A review fixes before accepting this composition. Root
exports, public factories, network handshake, transport, dependencies and A files
remain owned elsewhere. No complete `PublicClient` implementation is claimed.

## Exact source trace

Node checkout: `/tmp/zakura-upstream-review`, commit
`1e36d1bb6a8a9778a1bd316704b9c8cb75182de6` (Zakura v1.4.0).
Paths below are relative to that immutable checkout:

- `crates/zakura-rpc/src/methods.rs:1756–1837`: `get_block(String, Option<u8>)`
  calls verbose `get_block_header`, resolves identity, and requests transaction IDs
  by that hash, including when the original selector was a height.
- `methods.rs:1861–1872`: verbosity 1 maps the transaction index to
  `GetBlockTransaction::Hash`; missing data is an error, not a null result.
- `methods.rs:1956–1993`: successful responses supply hash, height, time, parent,
  `n_tx: tx.len()` and the ordered transaction list. The parent is supplied even
  for genesis. Optional tree/pool/size data is not used for this projection.
- `methods.rs:4690–4820`: `BlockObject` serde field spellings (`nTx`, `tx`,
  `previousblockhash`) and the untagged transaction hash/object variants.
- `crates/zakura-chain/src/transaction/hash.rs:116–145`: txid hex uses display
  byte order. SDK `blockHash`/`txId` enforce lowercase, unprefixed, 64-digit hex.
- `crates/zakura-chain/src/block/serialize.rs:24` and
  `transaction/serialize.rs:1263–1293`: source allocation ceiling is
  `2_000_000 / (41 + 4 + 9) = 37_037` transactions. This conservative ceiling
  does not attempt to prove a block's size or transaction validity.
- Verbatim successful fixture:
  `crates/zakura-rpc/src/methods/tests/snapshots/get_block_verbose_height_verbosity_1@mainnet_10.snap`,
  SHA-256 `e35a7ba66c2f581cd9654c06d87bedae8db0f8b30942b427b1d774f0616e57fe`.
  A's existing `blockOne` contains the corresponding immutable header bytes.

## Behavior and limits

1. Validate and snapshot source, exactly one selector, and signal before async
   callbacks. Lower a height to its decimal string or retain the canonical hash.
2. Call `getblock([selector, 1])` via existing `readRpc`, retaining its real
   transport byte/deadline/retry bounds and lossless JSON tokens.
3. Require integer height and time in uint32 range (time must match the serialized
   header's uint32 seconds), nonempty `nTx <= 37_037`, an exactly matching txid
   count, canonical hashes, and no duplicate txids. Reject fractions, exponent
   tokens, negative zero, rounded/unsafe numbers and strings in numeric fields.
4. Call A `getBlockHeader` by resolved hash. Its verbose and raw calls both use
   that hash. Compare height/hash/parent/time, preserve A's native Web Crypto
   SHA256d verification and cancellation, and check cancellation on completion.
5. Return the frozen `PublicBlock` contract shape: frozen record, point and txid
   array; raw bytes remain an independently owned mutable `Uint8Array` (nonempty
   typed arrays cannot be frozen). Raw is the serialized **header**, obtained from
   A, never a reconstruction from verbose JSON. Each result owns its arrays.

No RPC error is converted to absence. A successful null or incomplete result is
also a protocol failure in this source profile. Unsupported methods retain
`METHOD_NOT_SUPPORTED`; other RPC failures retain sanitized transport errors.
The owning client remains responsible for network/source binding. The caller's
source label is not independently authenticated by this internal helper.

Height pinning prevents combining two resolutions across a reorg; it does not
prove current-chain membership. Structural coherence and the header hash do not
prove transaction inclusion, a merkle root, consensus, Equihash or confirmations.
Unprojected verbose fields are ignored. No transaction codec, proof dependency,
worker, WASM or new public transport option is introduced.

## Qualification and handoff

Tests are in `tests/clients/public-block-reads.test.mjs` and
`tests/clients/public-block-reads-browser.mjs`. They reuse A's fixture transport
and immutable header vectors. The maximum-list test uses synthetic canonical
hash strings solely to test allocation/order, not as a cryptographic oracle.
Digest cancellation tests delegate to real native SHA-256.

Node covers exact calls, both selectors/reorg pinning, verbatim upstream snapshot,
input mutation, independent ownership, strict numeric/list/identity validation,
source allocation and transport byte bounds, sanitized errors, streaming abort,
callback abort, timeouts at each RPC, and cancellation at native digest completion.
Firefox uses an ordinary page-owned module script; WebDriver navigates and polls
`window.blockResult`. It checks actual local HTTP calls, native Web Crypto,
mutation, ownership, errors, cancellation/bounds and absence of eager WASM/worker
loads. The runner uses existing read-only `firefoxOptions` and installed packaged
geckodriver, records served asset hashes, and verifies session/process-group and
server cleanup. It never changes browser security settings.

Build command (all emitted files outside the worktree):

```sh
node node_modules/typescript/bin/tsc -p tsconfig.json --outDir /home/jack/zcash-public-block-scratch/dist
node --test --test-isolation=none --test-reporter=tap tests/clients/public-block-reads.test.mjs
PUBLIC_CHAIN_READS_BUILD=/home/jack/zcash-public-block-scratch/dist node --test --test-isolation=none --test-reporter=tap tests/clients/public-chain-reads.test.mjs
node tests/clients/public-block-reads-browser.mjs
```

In the worker sandbox, TypeScript and three socket-free tests pass. All local
HTTP tests fail at `listen EPERM: operation not permitted 127.0.0.1`; Firefox is
blocked before driver launch by the same socket restriction. The initial browser
attempt additionally recorded `spawnSync git EPERM`; incidental Git spawning was
removed from the runner in favor of hashing the exact source snapshot. Original
failure logs are retained. No socket/security override was attempted.

TDD evidence includes the initial missing-function assertion and the failing
invalid-input test before implementation. Network-dependent red/green execution
is **blocked**, not claimed successful; tests remain failing until the parent can
run them. Node-only checks do not qualify browser support.

The external `/home/jack/zcash-public-block-logs/REPORT.md` and `checkpoint.md`
record the scoped commit, commands, actual outcomes, and the hash-pinned runnable
package in owned scratch. `CLIresult.md` is the final worker summary. Parent runs
Node/installed Firefox outside this worker restriction, reviews independently,
incorporates A fixes, and reruns qualification before acceptance. No automatic
reviewer/queue worker, push, merge, installation or publication is performed here.

## First independent-review R1/R2 correction candidate

The R1/R2 correction is based on integrated A first fixes at `c2a3131`; A's
independent HIGH R2 review remains a separate acceptance gate. Source and selector
admission now copies each allowed own data descriptor once into a null-prototype
record. Reflection failures, revoked proxies and missing descriptors produce fixed
`INVALID_ARGUMENT` before callbacks. Property `get` traps are never invoked;
values returned by those traps cannot replace the captured descriptor values.

Cancellation uses the native AbortSignal state and an owned signal passed to HTTP
and A. Native listener methods bridge caller cancellation, with teardown in
`finally`; caller method shadows never enter downstream code. A final native
abort wins over an `aborted: false` shadow or a throwing accessor. A non-aborted
signal with an own accessor is rejected without invoking it. Existing transport,
timeout, protocol and crypto/runtime errors retain their original SDK codes.
On hosts whose native getter accepts proxies, Node's existing
`process.getBuiltinModule('node:util').types.isProxy` supplies the proxy check.
There is no static Node import or polyfill. Hosts lacking both a proxy-rejecting
native getter and that check fail closed for supplied signals. This worker tested
Node 26.8.1; it does not claim Node 18 or complete supported-version qualification.
Browser-native signal support is retained and must be verified on the candidate.

The unchanged independent 37-test suite originally reproduced 25 pass / 12 fail.
After descriptor-only capture, three old assertions requiring `get` execution are
incompatible with the requested behavior. The original stays immutable; an owned
copy changes only those three expectations and passes 37/37. Eight committed
socket-free R1/R2 regressions fail before the correction and pass afterwards.
The ordinary-page browser suite now includes descriptor/proxy controls and final
shadow cancellation after both real native digests. R3 was already corrected in
`39906b3`, with the prior parent Firefox PASS receipt; that receipt does not qualify
this new combined candidate.

The worker's real HTTP/Firefox attempts still fail at loopback `listen EPERM`.
Parent must freshly build the combined candidate and run all Node and actual
Firefox checks, then execute the real SIGINT/SIGTERM interruption helper at
`/home/jack/zcash-public-block-scratch/fixes/boundary/interrupted-browser.mjs`.
The helper is syntax-checked only, **not executed** in this worker. It waits for
an actual browser session/page, signals only the recorded runner identity, and
requires session/group/browser/server cleanup receipts and disappearance checks.
`PUBLIC_BLOCK_INTERRUPT_PROBE=1` is a runner-only IPC checkpoint for that helper.
External `fixes/boundary/REPORT.md` records exact commands, counts and remaining
parent gates. No whole-client or #6 acceptance is claimed; independent HIGH
rereview follows this first correction candidate.
