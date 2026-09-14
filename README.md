# zcash.js

**Private TypeScript SDK with qualified synthetic Node/browser wallet workflows.** The package exposes independent public, light and wallet clients, plus optional composition. Baseline wallet storage, account/query/sync, signing/proving and payment recovery paths have actual Node filesystem and Firefox OPFS evidence. This is not complete v1 acceptance or a published npm package.

See [local installation and runtime assets](docs/api/installation.md) for installing a local tarball and configuring the separately verified wallet runtime. The [API book](docs/api/README.md) describes the frozen contract; its compile-only examples are not evidence that every contract case is implemented. Signer selection (#97), threaded integration (#107), and current OPFS fault recovery (#116) have been qualified. Already-finalized transparent PCZT inputs (#102) remain deferred.

## Local review site

For development, use Node `^22.13.0` or `>=24` (required by ESLint):

```sh
npm ci
npm run docs:typecheck
npm run docs:build
npm run docs:preview
```

Open **http://127.0.0.1:4173/**. For editing, run `npm run docs:dev` at the same address instead; only one server can own port 4173. The site uses base `/`. GitHub Actions checks runtime lint/build/tests, declarations/examples, and the site; no Pages deployment is configured. Implemented exports are listed in [the implementation notes](docs/planning/agnostic-implementation.md); the API book also contains proposals that are not exported.

## Development checks

```sh
npm ci
npm run check
```

`check` runs ESLint, compiles the current source, and runs all Node test suites.
Tests use committed, hash-verified native WASM fixtures; no Rust toolchain,
external workspace, or blockchain provider is required. Generated test output
stays under `.local/tests/` or the OS temporary directory.

See `tests/README.md` for browser and optional TLS checks.

## Review contracts and evidence

- [Book contents and scope](docs/api/README.md), [full reference](docs/api/reference.md), and exact [declarations](docs/api/public-api.ts).
- [Versioned Rust/WASM host contract](docs/api/host-contract.md) and [operation/source mapping](docs/api/host-mapping.md).
- Settled [D01–D25 decisions](docs/planning/decision-log.md), [validation workplan](docs/planning/api-surface-workplan.md), and [functional gates](docs/planning/wasm-host-architecture.md#functional-acceptance-gates).
- [Tracked future issues](docs/planning/future-issues.md) and retained research, available in collapsed site sections.

The coherent locked Common 1.0.0 graph remains the implementation baseline; 1.1.0 migration is tracked separately. See [CONTRIBUTING.md](CONTRIBUTING.md) for scope, validation and private-data reporting rules.

## License

Project-owned code is [MIT licensed](https://github.com/jp4g/zcash.js/blob/main/LICENSE). Bundled dependencies retain their own licenses; keep the accompanying [third-party notices](https://github.com/jp4g/zcash.js/blob/main/licenses/README.md) when redistributing JavaScript/WASM artifacts.
