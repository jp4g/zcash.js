# Node and browser setup

| Capability | Node | Browser |
| --- | --- | --- |
| ESM package imports | Node 22.12+ | ESM bundler with modern WebAssembly support |
| Public queries | HTTP JSON-RPC | HTTP JSON-RPC with CORS |
| Light queries | Native gRPC | gRPC-Web endpoint with CORS |
| Durable wallet storage | `node-filesystem` | `browser-opfs` in a secure context |
| Disposable wallet | `memory` | `memory` |
| Wallet execution | Worker threads | Dedicated workers |

Browser RPC parsing also requires `JSON.parse` reviver `context.source` for lossless numeric tokens, and cancellation uses `AbortSignal.any`. A browser with WebAssembly alone is not sufficient.

Start with `threading: { mode: 'baseline' }`. Prefer-threaded mode requires a separately pinned threaded runtime. Browsers additionally need cross-origin isolation and `SharedArrayBuffer`; check your COOP/COEP, CORS, worker, and content-security policies together. Baseline remains the explicit fallback where permitted by configuration.

Serve runtime assets over the loader's accepted authenticated URLs. The loader runs verified bytes and manages worker staging; applications should not import an arbitrary downloaded wallet script themselves. The [runtime profile](https://github.com/jp4g/zcash.js/blob/main/src/runtime/wallet-profile.ts) is the source of accepted runtime identities and compatibility values.

Do not open the same wallet storage concurrently from multiple processes or tabs. Always close wallets on an orderly shutdown. OPFS data is origin-scoped and can be removed with browser site data; memory storage disappears at shutdown.

## Current limits

The package is private and experimental. It has no default network/provider, managed artifact hosting, persistent secret vault, database backup API, remote proving integration, or concrete hardware signer integration. Storage is not advertised as encrypted at rest.

The repository runs Node tests in CI. Actual Firefox SDK and wallet-host checks are separate runnable checks; a passing bundle build is not a browser execution test. The [test guide](https://github.com/jp4g/zcash.js/blob/main/tests/README.md) describes which checks execute real native fixtures and which need external runtime/proving packages.
