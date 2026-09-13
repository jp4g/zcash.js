# Installation and import notation

The repository builds a private SDK with actual synthetic Node filesystem and Firefox OPFS wallet qualification. It is not published. Keep `private: true`; these instructions install only a locally built tarball. See the [private delivery status](../planning/private-release-notes.md) for known limitations and the remaining security/privacy and dependency/license closeout.

## Install a local package

```sh
npm ci
npm run build
npm pack --ignore-scripts --pack-destination /absolute/local/output
# From the consuming application:
npm install /absolute/local/output/zcash.js-0.0.0.tgz
```

Use named ESM imports from `zcash.js`. Node native gRPC is available through the explicit `zcash.js/grpc-node` entry. Current package exports do not provide a CommonJS `require` entry. No CommonJS compatibility is claimed. The installed-tarball consumer check also uses pinned Webpack 5.110.3 through its Node API (no loaders or plugins), targeting web/ES2022. It executes the emitted full-export and public-query-only bundles without Node globals, network requests or WASM initialization, and checks that query-only imports remove wallet/storage/proving code. This VM check alone does not qualify browser worker execution or external runtime asset loading. An optional entry in the existing Firefox wallet harness tests those paths using the same external verified runtime assets.

Webpack emits four known dynamic-import warnings for guarded Node-only imports in `grpc.js`, `runtime/wallet.js` and `wallet/host.js` when bundling all exports. The consumer test checks this exact warning set; public-query-only imports have no warnings. These Node paths are not exercised by a browser target. Bundle size advisories are outside this compatibility check; no performance claim is made.

To prepare that optional browser entry, set `WALLET_WEBPACK_OUTPUT` to an owned scratch directory when running `node --test tests/sdk/consumer.test.mjs`. The test preserves the installed tarball, its Webpack ESM bundle and a hash receipt. Pass the same directory to the existing Firefox wallet harness alongside its normal `WALLET_LOADER`, runtime/native fixture and trusted TLS settings. The harness verifies the receipt, opens one additional empty OPFS wallet using only bundled public exports, reads local state, closes it and checks worker/storage cleanup. It does not add a proving workload. A passing bundle build is not a substitute for that actual Firefox result.

## Supply the verified wallet runtime

The SDK tarball includes standalone codec capsules. Wallet execution additionally needs the matching runtime package; it is not downloaded from an SDK-operated service. For the accepted payment baseline, use the retained `package-wallet-payments-03` output with its corresponding native build 03 receipt. Copy **the entire package directory**, including `manifest.json` and every listed executable, unchanged to your application's HTTPS static asset directory. Preserve relative filenames and serve `.wasm` as `application/wasm`, JavaScript as `text/javascript`, and the manifest as JSON. Do not redirect asset requests.

Set `runtime.baseline.manifestUrl` to that manifest's HTTPS URL and `manifestSha256` to the SHA-256 of its exact bytes, obtained from the trusted package receipt (not from an untrusted server response). The loader verifies the manifest, supported profile and every executable before opening storage. A different SDK/runtime combination requires matching reviewed pins; changing the manifest hash alone cannot override compatibility.

A baseline local-read configuration uses:

```ts
import { createWalletClient } from "zcash.js";

const wallet = await createWalletClient({
  network, // genuine defineNetwork(...) result for the application's network
  storage: { kind: 'node-filesystem', path: '/absolute/private/wallet-directory' },
  runtime: {
    baseline: { manifestUrl, manifestSha256 },
    threading: { mode: 'baseline' },
    maxMemoryBytes: 512 * 1024 * 1024, maxQueuedBytes: 65536,
    maxQueuedJobs: 8, scanBatchSize: 10, maxPcztBytes: 1048576,
  },
  confirmations: { trusted: 1, untrusted: 1, allowZeroConfirmationShielding: false },
  observation: { pollIntervalMs: 1000, maxBufferedUpdates: 16 },
  recovery: { mode: 'offline' },
});
try { await wallet.getSyncStatus(); } finally { await wallet.close(); }
```

In a browser, use `{ kind: 'browser-opfs', name: 'my-wallet' }` storage in a supported secure context and serve the same verified assets with your application. Browser gRPC requires a permitted gRPC-Web endpoint. Applications supply network identity, endpoints and any proving assets; the offline example performs no sync or submission. Proving needs larger configured memory/queue limits and canonical assets, as described in [signing](signing.md). Caller-owned signers and clients remain caller-owned after wallet close.

The accepted baseline does not establish healthy threaded support, every browser, or complete v1 acceptance. Account/signer/finalization gaps #97 and #102 remain explicit. Never use synthetic fixture network definitions with real funds.

## Reproduce the installed-wallet check

The existing consumer test packs and installs into an isolated temporary application. Supply the accepted runtime directory and a local fixture HTTPS certificate/key trusted through `NODE_EXTRA_CA_CERTS`:

```sh
WALLET_RUNTIME_PACKAGE=/absolute/path/package-wallet-payments-03 \
WALLET_TLS_CERT=/absolute/path/server.crt \
WALLET_TLS_KEY=/absolute/path/server.key \
NODE_EXTRA_CA_CERTS=/absolute/path/fixture-ca.crt \
node --test tests/sdk/consumer.test.mjs
```

This starts a loopback HTTPS asset server, opens and reopens an offline native filesystem wallet through the installed public package, and checks cleanup. It neither contacts a blockchain endpoint nor runs proofs. Without those variables, the standard consumer import/type/browser-bundle checks still run, and the actual wallet check is explicitly reported as unconfigured. The installed application is an ordinary `.mjs` file; avoid `node --input-type=module -e` for wallet execution because Node propagates that flag to file-backed workers.

## Review locally

From the repository root, with Node `^20.19.0` or `>=22.12.0`:

```sh
npm ci
npm run docs:typecheck
npm run docs:check-recovery
npm run docs:build
npm run docs:preview
```

Open **http://127.0.0.1:4173/**. `npm run docs:dev` serves the editing site at the same address; run one server at a time. Both commands require that exact port to be free and use base `/`. No Pages deployment is configured.

## Read the examples

Examples use direct named imports from the public entry point:

```ts
import { createWalletClient, formatZec, isZcashError, parseZec } from "zcash.js";
import type { WalletOptions } from "zcash.js";
```

No namespace object is required. Types use type-only named imports; factories and utilities use ordinary named imports.

<<< ./examples/notation.ts

The embedded specification examples remain compile-only. Supply real application configuration before execution and do not cast application data into opaque brands. Declared application inputs and callbacks represent code the consumer supplies; they are not SDK exports. The walkthrough keeps its explicit, typed application configuration outside the displayed setup region; the complete source includes those values. `parseZec` and `formatZec` are implemented root utilities for exact decimal ZEC input and display, with bigint zatoshis between them.

The example tsconfig uses strict checking and `noEmit`. Its exact `zcash.js` path alias resolves to `../public-api.ts` solely for declaration checking; it does not provide runtime module resolution or generate JavaScript. The public API is available from the root entry; native Node gRPC also has the explicit `zcash.js/grpc-node` entry. Specification typechecking alone does not qualify runtime behavior.

## Retained Webpack browser result

Webpack 5.110.3's installed-package bundle was exercised by the existing Firefox wallet harness with accepted runtime package 03. The non-proving run passed public OPFS open/read/close through the bundled entry (`webpackWallet: true`), alongside the existing baseline workflows: 25 workers destroyed, 82,379 ms, and complete browser/driver/server cleanup. Receipt: `/home/jack/zcash-webpack-consumer-firefox-01-logs/firefox-GKpMPc.json`, SHA-256 `5f611b75666c2f1b382dc99dfb6209c74a60c95201b5b866742dc6d9c463b625`. The tested bundle-02 SHA-256 is `1665d7e443af7c512c6bada546b17c307e99799900e4b780a30d30cbaed994bc`.

This qualifies the tested browser bundle and unchanged external runtime asset path. It does not establish Webpack Node/CJS output, threaded execution, a proving workload through the Webpack bundle, or complete v1 acceptance.
