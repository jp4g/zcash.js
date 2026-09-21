# zcash.js

An experimental TypeScript SDK for Zcash chain queries and local wallets on Node and browsers.

**[Read the developer guide](https://jp4g.github.io/zcash.js/api/README.html)** · [First request](https://jp4g.github.io/zcash.js/api/installation.html) · [Wallet walkthrough](https://jp4g.github.io/zcash.js/api/walkthrough.html) · [API reference](https://jp4g.github.io/zcash.js/api/reference.html)

## What it provides

- Public JSON-RPC queries and transaction observation through `createPublicClient`.
- Lightwallet queries and streams through `createLightClient`.
- Local accounts, scanning, proposals, signing, submission, and recorded payment recovery through `createWalletClient`.
- Exact bigint amounts, validated network/identifier values, viewing/address tools, and PCZT utilities.

`@jp4g/zcash.js@0.1.0-rc.3` is the next experimental release candidate; registry publication remains owner-controlled. It includes codec capsules, the baseline wallet engine, workers, and local Sapling proving assets. Wallet execution loads the bundled engine automatically; proving assets load only when needed. Mainnet/testnet presets include genesis hashes and activation schedules; applications supply endpoints and storage. Custom network definitions remain supported. See [wallet setup](https://jp4g.github.io/zcash.js/api/wallet-runtime.html) and [platform limits](https://jp4g.github.io/zcash.js/api/platforms.html). Clean-package and testnet release qualification is tracked in [#165](https://github.com/jp4g/zcash.js/issues/165).

```js
import { createLightClient, createWalletClient } from '@jp4g/zcash.js';

const light = await createLightClient('https://testnet.zec.rocks:443', { network: 'testnet' });
// Use light.network and light when creating your wallet.
```

The same import works in Node and browser applications. No separate runtime
package, Rust installation, or post-install asset download is required. Browser
bundlers emit the lazy WASM/worker/proving files alongside the application; deploy
those files too. Persistent Node wallets currently require Linux and `flock`.

Historical wallet-database migration and the complete live-browser send/receive
round trip are not yet qualified. Fresh database creation and same-candidate
reopening are verified; these do not establish older-database compatibility.

## Build and test

Use Node 22.12 or newer and npm.

```sh
npm ci
npm run check
```

`check` runs source lint, the TypeScript/capsule build, and Node tests. See [tests/README.md](https://github.com/jp4g/zcash.js/blob/main/tests/README.md) for actual browser checks and optional runtime/proving prerequisites. Use `npm pack` to build, verify bundled assets, and prepare a local package; see [installation](https://jp4g.github.io/zcash.js/api/installation.html).

## Documentation

```sh
npm run docs:typecheck
npm run docs:build
npm run docs:dev
```

The local guide runs at `http://127.0.0.1:4173/`. Its displayed TypeScript snippets are checked against the actual package entry point. GitHub Pages deploys automatically after checks pass on `main`. [Publishing instructions](https://jp4g.github.io/zcash.js/api/gitbook.html) also cover optional GitBook Git Sync using the same Markdown chapters.

[Contributing](https://github.com/jp4g/zcash.js/blob/main/CONTRIBUTING.md) describes the PR workflow. Retained planning and research live under `docs/planning` and `docs/research` in the repository; they do not override the implemented API and are not shipped in the npm package.

## License

Project-owned code is [MIT licensed](https://github.com/jp4g/zcash.js/blob/main/LICENSE). Bundled dependencies retain their own licenses; preserve the [third-party notices](https://github.com/jp4g/zcash.js/blob/main/licenses/README.md) when redistributing JavaScript/WASM artifacts.
