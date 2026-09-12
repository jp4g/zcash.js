# Internal light-chain reads

This slice exports only internal `getTip(codec, transport, args?: Op)` and
`streamCompactBlocks(codec, transport, args: HeightRange & Op)` from
`src/clients/light-chain-reads.ts`. Results use the unchanged public `ChainTip`
and `CompactBlock` declarations. There is no factory, Network token, full
LightClient cast, root export, artifact acquisition, evaluation or worker creation.
The caller supplies the actual, already initialized accepted lightwire instance
and a `CustomLightTransport`. Its structural codec parameter is limited to the
three actual stateless facade methods; it is not an alternative codec interface
implementation or runtime registry.

## Source profile and decisions

Accepted private source: `84585f25f7fed6a897891f5fb5bc509c76dddd05` at
`/home/jack/zakura-lightwire-codec`. Its `lightwire/README.md`, `src/messages.rs`,
`vendor/service.proto`, `vendor/compact_formats.proto`, and `vendor/SHA256.json`
are authoritative for method/DTO fields. The private facade accepts primitive
JSON text; all uint64 fields decode as canonical decimal strings and bytes decode
as lowercase wire-order hex. Requests here are `{}` for the empty ChainSpec and
at most 63 ASCII JSON bytes for two uint32 decimal-string BlockIDs. No caller
record is serialized, and no pool filter is sent. Default schema behavior does
not promise transparent compact coverage.

The internal expected `CustomLightTransport.protocolRevision` is exactly:

```text
lightwire:80575dbe59a9bf2e6b79e2391eb78679c453f1a0477292eb97ea3b58bb6c8b10:d8d0c8aaa5ceec7d5dcc188ef25b04011df2ec0254901620fce982fc13aeb32d
```

The two digests identify the accepted service.proto and compact_formats.proto,
in that order. This local profile spelling binds the documented exact schema
pair. It is NOT the server-advertised `LightdInfo.lightwalletProtocolVersion`
(`v0.5.0`), a server identity, or a claim that a server advertises a source digest.
Unknown/mismatching revisions reject before codec or transport use.

The source research at `/home/jack/.hermes/zcash-client-source-research.md`
records lightwalletd `09593edbee4ee68d47e5a53f8ce1c83514c4e8e6`,
`frontend/service.go:83–86`: latest-block hash bytes reverse the display hash.
Wallet source `a9142ee100b3a563b7d9ba7a8e94201d00ad8154`,
`librustzcash/zcash_client_backend/src/proto.rs:72–98`, interprets compact hash
and previous-hash bytes as `BlockHash::from_slice`. The selected published
`zakura-primitives-1.0.0/src/block.rs:47–51` reverses that internal byte sequence
for Display. Therefore these two methods reverse exactly 32 wire bytes to display
BlockHash. This helper is not applicable to GetTreeState's different byte order.

Heights must fit uint32 before conversion to Number. A height-zero point with a
32-byte hash is allowed; empty/default messages fail because their hash is absent.
No genesis or consensus authenticity is inferred. Each checked result receives
a UTC observation timestamp and the captured caller sourceId label (1–256 code
units); endpoints and foreign error text never enter adapter diagnostics.

## Bounds and completion

Ranges are ordered, inclusive uint32 endpoints, with 1–1,024 blocks. Each message
is at most 4 MiB and the total admitted compact payload is at most 64 MiB. The
accepted codec independently bounds protobuf fields, depth and occurrences.
There is one underlying pull per next call, no queued concurrent next calls,
no read-ahead, retries or replay. Exactly the requested heights, count, 32-byte
hashes and predecessor linkage are checked. The first predecessor is reported,
not independently anchored. Full encoded input bytes are copied before decoding,
including unknown fields, legacy data and Ironwood; they are never reconstructed.
Output arrays remain intentionally mutable and independently owned.

After the last block, consumers must request terminal completion. A subsequent
extra item, missing/failed terminal status, short range or transport error rejects;
previously yielded blocks are partial observations, never complete coverage.
Custom transports must implement their own status/deadline and resource-release
contract. The accepted gRPC-Web byte transport provides terminal/status checking.
This layer cannot prove status correctness or forcibly terminate arbitrary
synchronous/noncooperative caller code.

Ordinary same-realm native AbortSignals are admitted; proxies, overridden native
state, subclasses and foreign-realm signals reject. Node follows the accepted
byte transport's intrinsic proxy-check availability policy. Native
`AbortSignal.any` supplies a private dependent signal, avoiding synthetic caller
events and earlier-listener suppression. Intrinsic state checks occur before
acquisition, after awaited reads and immediately before result delivery. A private
transport signal is aborted on release. Return/abort invokes the underlying
iterator return once and settles pending adapter calls without awaiting a hung
foreign return. Returning an unused iterator acquires nothing. Unknown options
and accessor option properties reject. Stream argument admission is synchronous;
transport acquisition is lazy until the first next call.

## Qualification and gates

Tests directly import the authentic accepted artifact only after checking the
pinned receipt, complete source inventory and artifact hashes. This fixture-only
import is not production loading and does not reopen the denied primitive-loader
scope. Accepted build receipt SHA256:
`f0a385adffe4bdca50e39b951658f2d021ebb5011ceb00b6b78f63b988e3b5cc`;
codec.mjs `03ce82c6df4fb483b7d73e52a49988fd368cef33d1c1284c44378869a16f67da`;
WASM `4803d36718071fc1b114c1d0dce766b876da02234e3c2078979c5dc69ad37da9`.
Fixtures derive fields from the pinned schemas and include the real independent
`lightwire/tests/golden.json` Ironwood vector. No generated production protobuf is
reimplemented in TypeScript.

Node tests exercise real WASM + this adapter + the accepted gRPC-Web transport
with synthetic Fetch responses, plus custom iterator lifecycle controls. Separate
Node HTTP and ordinary page-owned Firefox runners share localhost checks. Firefox
uses the existing `grpc-web-browser.mjs` process/profile/session cleanup pattern;
no automation-realm module imports or general evidence framework was introduced.
Receipts bind source, build, assets, requests and cleanup. Run the following on
the reviewed parent host, with a fresh external output directory:

```sh
set -eu
cd /home/jack/zcash-worktrees/light-chain-reads
CHAIN_RUN=$(mktemp -d /home/jack/zcash-light-chain-scratch/parent.XXXXXX)
CHAIN_LOG=$(mktemp -d /home/jack/zcash-light-chain-logs/parent.XXXXXX)
node /home/jack/zcash.js/node_modules/typescript/bin/tsc -p tsconfig.json --outDir "$CHAIN_RUN/build" > "$CHAIN_LOG/tsc.log" 2>&1
printf '{"type":"module"}\n' > "$CHAIN_RUN/build/package.json"
LIGHT_CHAIN_BUILD="$CHAIN_RUN/build" node tests/clients/light-chain-reads.test.mjs > "$CHAIN_LOG/unit.log" 2>&1
LIGHT_CHAIN_BUILD="$CHAIN_RUN/build" LIGHT_CHAIN_LOGS="$CHAIN_LOG" node tests/clients/light-chain-reads-network.mjs > "$CHAIN_LOG/node-network.log" 2>&1
LIGHT_CHAIN_BUILD="$CHAIN_RUN/build" LIGHT_CHAIN_LOGS="$CHAIN_LOG" LIGHT_CHAIN_SCRATCH="$CHAIN_RUN" node tests/clients/light-chain-reads-browser.mjs > "$CHAIN_LOG/firefox.log" 2>&1
```

Run each command only after the preceding command succeeds. No dependencies are
installed, no output goes to primary, and the runner uses installed
`/snap/bin/geckodriver` with its matching ordinary Firefox. The local sandbox denied
both localhost attempts (`listen EPERM`); no HTTP requests or Firefox session
occurred. Actual Node HTTP and Firefox runtime/cleanup qualification is pending
parent execution. Fetch on Node does not qualify native HTTP/2 gRPC. The native
gRPC package, full package/profile/handshake composition, network registration,
independent review and full SDK acceptance remain gated. No loader, wallet,
full-node adapter, private binding, deployment or live-chain work is included.

The final worker report, CLI result, test exits and retained receipts are under
`/home/jack/zcash-light-chain-logs/`. RED→GREEN evidence is retained separately;
repeated runs and overlapping case matrices must not be summed as independent
coverage.

## First R1 correction

The initial independent HIGH review held `09576a7a47af5241a36ecd05c7844cea032e6924`
for two P2 custom-transport defects. Admission now reads `sourceId` once, validates
that exact primitive string, and retains only that value. Unary, stream,
async-iterator acquisition and next methods are resolved before a native
cancellation check and invoked with their original receivers. If cancellation
prevents iterator acquisition, an already returned iterable's optional return is
released best effort; an acquired distinct iterator is released once instead.
Cleanup return remains permitted after cancellation because it releases resources.
The authentic initialized codec methods are not caller transport acquisition sites.

Regression tests were added before production edits: the original source passed
26/36 and failed 10 cases across unary/stream label validation and all four getter
cancellation sites. The copied independent required-contract diagnostic failed
0/2, then passed 2/2. Corrected source passes 37/37 authentic-codec unit tests,
including all original 22 and a distinct-iterator acquisition cleanup control.
Local compiler/tests used installed Node 26.8.1; corrected-head Node 22 and ordinary
Node HTTP/Firefox host qualification remain coordinator gates. Logs and retained
RED output are under `/home/jack/zcash-light-chain-logs/fixes/r1` and external
builds/helper under `/home/jack/zcash-light-chain-scratch/fixes/r1`.

The earlier pending-parent statement above records the original worker handoff.
Subsequent parent-01 exact-original-source Node 22 unit and ordinary Node/Firefox
runs passed (each network matrix: 109 assertions/28 requests), source-bound by
HIGH R1. Coordinator also executed the original helper SHA256
`a11054862123353d172a9bac4c8264b0457f0ccf84416dee059e69cadaae2898` with exit 0;
`review/r1/coordinator-interruptions.log` records all eight real SIGINT/SIGTERM
Firefox acquisition/session controls. These original-source receipts do not
qualify this correction. A new corrected-head/source/build-pinned helper preserves
those controls for separate parent execution; timing misses remain failures.

N1 remains a scoped observation about unsupported native signal descriptor
mutation after admission. This correction makes no broad prototype/global
immunity promise and does not reopen that nonblocking observation, codec,
loader/profile, native gRPC, public factories, or unrelated implementation lanes.
Independent HIGH R2 acceptance belongs to the coordinator.
