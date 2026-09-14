# zcash.js

**Private TypeScript SDK with qualified synthetic Node/browser wallet workflows.** The package exposes independent public, light and wallet clients, plus optional composition. Baseline wallet storage, account/query/sync, signing/proving and payment recovery paths have actual Node filesystem and Firefox OPFS evidence. This is not complete v1 acceptance or a published npm package.

See [local installation and runtime assets](docs/api/installation.md) for installing a local tarball and configuring the separately verified wallet runtime. The [API book](docs/api/README.md) describes the frozen contract; its compile-only examples are not evidence that every contract case is implemented. Known gaps include generic signer selection for UFVK attachment (#97), already-finalized transparent PCZT inputs (#102), and healthy threaded runtime integration.

## Local review site

Use Node `^20.19.0` or `>=22.12.0`:

```sh
npm ci
npm run docs:typecheck
npm run docs:build
npm run docs:preview
```

Open **http://127.0.0.1:4173/**. For editing, run `npm run docs:dev` at the same address instead; only one server can own port 4173. The site uses base `/`. No Pages deployment is configured. The package remains private; local distribution qualification does not authorize publication or deployment.

## Review contracts and evidence

- [Book contents and scope](docs/api/README.md), [full reference](docs/api/reference.md), and exact [declarations](docs/api/public-api.ts).
- [Versioned Rust/WASM host contract](docs/api/host-contract.md) and [operation/source mapping](docs/api/host-mapping.md).
- Settled [D01–D25 decisions](docs/planning/decision-log.md), [validation workplan](docs/planning/api-surface-workplan.md), and [functional gates](docs/planning/wasm-host-architecture.md#functional-acceptance-gates).
- [Tracked future issues](docs/planning/future-issues.md) and retained research, available in collapsed site sections.

This is the documentation deliverable for [issue #1](https://github.com/jp4g/zcash.js/issues/1), not completion of runtime/design qualification gates. The coherent locked Common 1.0.0 graph remains the implementation baseline; 1.1.0 migration is tracked separately. No license has been selected. See [CONTRIBUTING.md](CONTRIBUTING.md) for scope, validation and private-data reporting rules.

## License

Project-owned code is [MIT licensed](LICENSE). Bundled dependencies retain their own licenses; keep the accompanying [third-party notices](licenses/README.md) when redistributing JavaScript/WASM artifacts.
