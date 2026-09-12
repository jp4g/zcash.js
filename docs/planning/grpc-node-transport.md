# Native Node byte transport

`import { createGrpcNodeTransport } from 'zcash.js/grpc-node'` exposes a
`CustomLightTransport` adapter on Node only. Supply an `http://host:port` native
plaintext endpoint or an `https://host:port` native TLS endpoint and
`{ sourceId, timeoutMs, headers? }`. TLS uses grpc-js default certificate and
hostname verification. URLs cannot contain credentials, paths, queries or fragments.
Headers are an asynchronous per-operation string metadata callback; binary request
metadata and reserved transport headers are rejected. Response metadata is handled
by grpc-js and is not exposed by the existing byte-only contract.

The seven unary and four server-streaming methods are the frozen public contract.
Requests and responses are owned opaque protobuf bytes; there is no codec, network
handshake, genesis proof or transaction-status interpretation here. In particular,
NOT_FOUND remains a transport failure, never successful absence. Error messages
exclude endpoint, credentials, metadata and server text. UNIMPLEMENTED maps to
METHOD_NOT_SUPPORTED; deadline, cancellation and resource exhaustion retain their
SDK categories. There is no automatic retry or stream replay.

Each operation owns a grpc-js channel and closes it on completion, failure,
deadline or cancellation. Streams dispatch on first pull; iterator return cancels
pending reads immediately. grpc-js's Node Readable supplies bounded object-mode
backpressure (its runtime high-water mark), with a 4 MiB per-message receive limit.
The adapter additionally caps delivered bytes at 64 MiB and messages at 65,536.
`limits: { messageBytes?, totalBytes?, messages? }` can lower these ceilings.
The deadline includes waiting for metadata and idle time between pulls. Incoming
compressed-message handling and message-size enforcement belong to grpc-js.

Schema: wallet-libraries a9142ee100b3a563b7d9ba7a8e94201d00ad8154,
wallet-vendored lightwallet-protocol v0.5.0; exact service/compact SHA256 pair is
reported in `protocolRevision`. Reference server semantics are lightwalletd
v0.5.4, 09593edbee4ee68d47e5a53f8ce1c83514c4e8e6, as recorded in the
coordinator's client source research. No protobuf generation or upstream source
incorporation is needed for a byte adapter.

The package root and browser transport are unchanged. Browser-condition bundling
checks root import isolation and rejects the native subpath; it does not establish
native gRPC in browsers. The root `grpc()` factory integration remains coordinator
work. Local synthetic tests run with `npm run build` then
`node tests/sdk/grpc-node.test.mjs`. Native TCP loopback tests require a host that
permits listening. This implementation is pending independent review and host
runtime verification; no live provider compatibility is claimed.
