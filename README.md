# zcash.js

**Proposed v1 API · documentation/specification only.** This private repository contains no production SDK, runtime dependencies, published npm package or validated wallet support. The proposed product is one TypeScript API for Node and browsers, backed by Zakura Rust/WASM, targeting transparent, Sapling and Ironwood.

Start stakeholder review with the [API book](docs/api/README.md) and its [end-to-end walkthrough](docs/api/walkthrough.md): client setup, account creation/recovery, sync, receive, balances, reviewed send, wait, restart/resume and close. Each chapter distinguishes proposed behavior, missing implementation and qualification requirements. Examples contain no real wallet data and are compile-only.

## Local review site

Use Node `^20.19.0` or `>=22.12.0`:

```sh
npm ci
npm run docs:typecheck
npm run docs:build
npm run docs:preview
```

Open **http://127.0.0.1:4173/**. For editing, run `npm run docs:dev` at the same address instead; only one server can own port 4173. The site uses base `/`. GitHub Actions checks declarations/examples and builds the site only; no Pages deployment is configured. The root private package contains development tooling only, with no SDK entry points or runtime dependencies.

## Review contracts and evidence

- [Book contents and scope](docs/api/README.md), [full reference](docs/api/reference.md), and exact [declarations](docs/api/public-api.ts).
- [Versioned Rust/WASM host contract](docs/api/host-contract.md) and [operation/source mapping](docs/api/host-mapping.md).
- Settled [D01–D25 decisions](docs/planning/decision-log.md), [validation workplan](docs/planning/api-surface-workplan.md), and [functional gates](docs/planning/wasm-host-architecture.md#functional-acceptance-gates).
- [Tracked future issues](docs/planning/future-issues.md) and retained research, available in collapsed site sections.

This is the documentation deliverable for [issue #1](https://github.com/jp4g/zcash.js/issues/1), not completion of runtime/design qualification gates. The coherent locked Common 1.0.0 graph remains the implementation baseline; 1.1.0 migration is tracked separately. No license has been selected. See [CONTRIBUTING.md](CONTRIBUTING.md) for scope, validation and private-data reporting rules.
