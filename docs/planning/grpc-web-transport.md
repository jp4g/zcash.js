# Internal browser gRPC-Web byte transport

Bounded implementation for #43 (child of #6). `src/clients/grpc-web.ts` supplies
`createGrpcWebByteTransport(endpoint, options)` with `unary` and `stream` over
opaque protobuf bytes. It is intentionally internal and has no root export,
`GrpcTransport` brand, `CustomLightTransport` identity, or `LightClient` claim.
It performs no protobuf field decoding, network handshake, or submission outcome
interpretation. Native Node gRPC and platform selection remain separate.

## Source selection

Verified local wallet checkout `/home/jack/zcash-qualification-scratch/wallet`
at `a9142ee100b3a563b7d9ba7a8e94201d00ad8154`, file
`librustzcash/zcash_client_backend/lightwallet-protocol/walletrpc/service.proto`,
SHA-256 `80575dbe59a9bf2e6b79e2391eb78679c453f1a0477292eb97ea3b58bb6c8b10`.
The package and service declarations select exactly
`/cash.z.wallet.sdk.rpc.CompactTxStreamer/{method}`. No arbitrary path is accepted.

| Shape | Methods in the frozen declaration and verified service |
| --- | --- |
| Unary | GetLatestBlock, GetLightdInfo, GetTransaction, GetAddressUtxos, GetTaddressBalance, GetTreeState, SendTransaction |
| Server stream | GetSubtreeRoots, GetBlockRange, GetTaddressTransactions, GetMempoolStream |

The official [gRPC-Web protocol](https://github.com/grpc/grpc/blob/929d4786fe97a4096d808e0a966c0348d696f2f8/doc/PROTOCOL-WEB.md)
and linked [native protocol](https://github.com/grpc/grpc/blob/929d4786fe97a4096d808e0a966c0348d696f2f8/doc/PROTOCOL-HTTP2.md)
were retrieved from grpc/grpc revision
`929d4786fe97a4096d808e0a966c0348d696f2f8` on 2026-09-11.
Their SHA-256 digests, respectively, are
`4363dbeeafc2f47a116710f35706ac89e53a0d69c10c80d5fd4a9c8b5cc7add6`
and `b51ea1b8cee67ad3477e73152bb60ac3ebf6e164962b46ba79434e980739256f`.
This is a **documentation revision**, separate from the lightwallet schema pin
and any server-advertised lightwallet protocol version.

## Selected internal profile

POST uses `application/grpc-web-text+proto` for both content type and accept.
The response may omit `+proto`; optional `charset=utf-8` is accepted. Both
message encoding and accepted message encoding are identity. Compressed or
reserved frame flags, visible nonidentity response HTTP content coding, and unsupported
media types fail. There is no decompressor or additional dependency.

Base64 decoding carries at most one quartet between reads. Independently padded
flushes may occur anywhere in the decoded stream. Canonical padding bits and
alphabet are checked. A five-byte frame header is assembled before validating
its unsigned big-endian length and allocating the owned payload.

Successful completion requires a single successful terminal status and EOF.
Trailers are last, lower-case ASCII header blocks, with one optional final CRLF.
Duplicate trailer field names, malformed/missing/duplicate statuses, incomplete
base64/frames, extra bytes after trailers, and unsupported status codes fail.
`grpc-status-details-bin` is explicitly unsupported: validating rich status
would require protobuf decoding outside this slice. `grpc-message` is discarded,
including malformed percent escapes; its text never enters diagnostics.
Trailers-only response headers support success for empty streams; unary still
requires exactly one data message. HTTP 200 alone cannot establish success.

Status 12 maps to `METHOD_NOT_SUPPORTED`; other valid nonzero statuses, including
NOT_FOUND, map to `TRANSPORT_ERROR`, never null. All diagnostics use existing
sanitized error constructors. No request is retried, including SendTransaction;
`retryable` is false for this internal profile. Higher layers must interpret
submission uncertainty and successful SendResponse bytes themselves.

Only absolute HTTP(S) origin URLs with an explicit `http://` or `https://`
authority and root path are supported. Scheme matching is case-insensitive;
single/extra slashes and backslashes are not repaired into an authority. A query is
preserved for endpoints that require it; userinfo (including empty userinfo),
fragments, whitespace, backslashes, and custom base paths reject. Fetch uses
`credentials: omit`, redirect errors, no cache and no referrer. Caller header
callbacks are captured once; each result is snapshotted before dispatch. Custom
headers cannot override protocol headers or selected browser-controlled fields.
Authorization headers remain supported and secret.

Requests are copied synchronously at method admission, before any await and,
for streams, before first `next()`. Ordinary Uint8Array views (including Node
Buffer) are accepted through intrinsic brand/buffer access. Shared, resizable,
detached, proxy, spoofed and wrong-element-type inputs reject. Every output
payload has its own ordinary Uint8Array backing buffer.

Signals use the native AbortSignal getter. Browser WebIDL rejects proxy receivers.
Where a host getter accepts proxies (including Node 26), admission additionally
uses the native `process.getBuiltinModule('node:util').types.isProxy` check.
There is no static Node import or browser polyfill. Such a host without that
check rejects supplied signals with INVALID_ARGUMENT before dispatch; it does
not claim a proxy-proof brand check from the getter alone. Genuine browser
signals remain supported; actual page-owned Firefox verification of changed
bytes remains a coordinator acceptance requirement.

## Bounds and lifecycle

These options belong only to this internal helper; frozen public options are
unchanged. `timeoutMs` is required, an integer from 1 through 2,147,483,647.
Optional `headers` matches the frozen asynchronous header callback shape.
Optional `limits` may lower any of these fixed ceilings, using positive integers:

| Internal limit | Default and ceiling |
| --- | ---: |
| messageBytes (request and each response) | 4 MiB |
| chunkBytes (each Fetch-visible body chunk) | 1 MiB |
| wireBytes (total Fetch-visible base64 bytes) | 96 MiB |
| decodedBytes (all decoded frame headers and payloads) | 64 MiB |
| messages (response data frame count) | 65,536 |

Response headers and trailer payloads are independently capped at 8 KiB;
custom request headers have an 8 KiB budget. Header accounting adds 32 bytes per
field. The decoder allocates 12 KiB blocks. A stream retains at most one wire
chunk, one decoder block, frame header and current payload, plus its bounded
request representation. Unary may retain the first result while detecting a
second frame. Request framing/base64 copies are also bounded by messageBytes.
There is no producer queue, and overlapping `next()` calls reject. Browser/Fetch
socket, HTTP header and content-decoding buffers are platform-owned and cannot
be given a hard process-memory limit by this API; wireBytes measures bytes
exposed by Fetch, not raw socket traffic. Rejected HTTP compression is never
accepted as a supported profile.

A stream starts work on first `next()`. Its deadline includes callback execution,
request encoding, Fetch, parsing, and time paused by the consumer; synchronous
work also checks elapsed time before dispatch/delivery/completion. `return()`
and caller abort immediately abort Fetch, cancel/release the reader and clear
the timer/listener, including during pending reads or paused iteration. Foreign
listener-removal failures cannot replace ABORTED/TIMEOUT or prevent owned Fetch
and reader cancellation; removing a hook from a hostile caller-owned signal is
best effort. Foreign cancellation promises are not awaited. Late Fetch responses are cancelled.
Returning early produces no successful stream coverage assertion. An unstarted
iterator has no request, timer or signal hook to release.

## Internal usage and checks

```ts
import { createGrpcWebByteTransport } from '../../src/clients/grpc-web.js';

const bytes = createGrpcWebByteTransport(endpoint, { timeoutMs: 30_000 });
const reply = await bytes.unary({ method: 'GetLightdInfo', request: encodedRequest, signal });
for await (const block of bytes.stream({ method: 'GetBlockRange', request: encodedRange, signal })) {
  consumeOpaqueBytes(block);
}
```

The example names caller-supplied encoded bytes; it supplies no invented DTO
encoding or network behavior. For this worktree:

```sh
npm run build
node --test tests/clients/grpc-web.test.mjs
npm run test:sdk
node tests/clients/grpc-web-browser.mjs
```

The standalone Firefox runner uses installed `/snap/bin/geckodriver`, ephemeral
loopback ports and owned profiles under `/home/jack/zcash-grpc-web-scratch`.
Results go to `/home/jack/zcash-grpc-web-logs/firefox.json`. It imports only this
worktree's built transport and errors modules, and reuses Firefox launch options
read-only. It does not invoke the old source-pinned SDK browser runner. Cleanup
is restricted to its session, recorded process identities/group and fixture.
No install, TLS override, sandbox override or live endpoint is involved.

## Integration obligations

The coordinator independently reviews and tests this slice, selects native Node
gRPC and platform composition, and supplies pinned protobuf codecs, method DTO
validation and host limits. Full client composition must validate protocol and
network observations; GetLightdInfo does not prove genesis equality. Range
coverage/order/reorg handling, custom transport revision checks and transaction
submission reports require their own implementations. Applications still need
a compatible gRPC-Web endpoint and qualified CORS/header exposure for their
actual origin. These same-origin localhost fixtures establish byte transport
behavior, not deployment, live server compatibility, consensus or wallet behavior.

CORS qualification must expose all relevant `grpc-*` and `Content-Encoding`
headers: Fetch hides unexposed headers, so missing visible encoding does not
prove identity and hidden contradictory status cannot be checked. Fetch may
also decode HTTP content coding before delivering the body; exposed
Content-Length may describe different bytes. The cumulative Fetch-visible
byte limit still applies, but neither the length precheck nor same-origin
fixtures establish rejection of hidden cross-origin compression/status or
a raw-network memory bound. No such deployment protection is claimed.
