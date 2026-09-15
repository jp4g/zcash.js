# zcash.js

An experimental TypeScript SDK for Zcash chain queries and local wallets on Node and browsers.

**[Read the developer guide](docs/api/README.md)** · [First request](docs/api/installation.md) · [Wallet walkthrough](docs/api/walkthrough.md) · [API reference](docs/api/reference.md)

## What it provides

- Public JSON-RPC queries and transaction observation through `createPublicClient`.
- Lightwallet queries and streams through `createLightClient`.
- Local accounts, scanning, proposals, signing, submission, and recorded payment recovery through `createWalletClient`.
- Exact bigint amounts, validated network/identifier values, viewing/address tools, and PCZT utilities.

The package is private and has no published npm release. Codec capsules are included; wallet execution additionally needs a compatible authenticated runtime package. Applications supply network parameters, endpoints, and any local proving assets. See [wallet setup](docs/api/wallet-runtime.md) and [platform limits](docs/api/platforms.md).

## Build and test

Use Node 22.12 or newer and npm.

```sh
npm ci
npm run check
```

`check` runs source lint, the TypeScript/capsule build, and Node tests. See [tests/README.md](https://github.com/jp4g/zcash.js/blob/main/tests/README.md) for actual browser checks and optional runtime/proving prerequisites. Use `npm run build` followed by `npm pack --ignore-scripts` to prepare a local package; see [installation](docs/api/installation.md).

## Documentation

```sh
npm run docs:typecheck
npm run docs:build
npm run docs:dev
```

The local guide runs at `http://127.0.0.1:4173/`. Its displayed TypeScript snippets are checked against the actual package entry point. [GitBook setup](docs/api/gitbook.md) uses the same Markdown chapters and navigation; no separate documentation copy is generated.

[Contributing](CONTRIBUTING.md) describes the PR workflow. Retained planning and research live under `docs/planning` and `docs/research`; they do not override the implemented API.

## License

Project-owned code is [MIT licensed](https://github.com/jp4g/zcash.js/blob/main/LICENSE). Bundled dependencies retain their own licenses; preserve the [third-party notices](https://github.com/jp4g/zcash.js/blob/main/licenses/README.md) when redistributing JavaScript/WASM artifacts.
