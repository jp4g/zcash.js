# Changelog

## 0.1.0-rc.1 — single-import release candidate

- Package identity is `@jp4g/zcash.js`.
- Wallet creation defaults to the included baseline WASM engine, worker and
  storage adapters. Runtime configuration is an optional advanced override.
- Canonical Sapling proving parameters are included and load only when needed.
  Ironwood execution does not require downloading those Sapling parameter files.
- Node reads package assets locally. Browser application bundlers emit lazy assets
  alongside application JavaScript; the root import does not start a wallet.
- Native builds verify locked dependencies, policy patches and tool identities;
  source-path normalization enables byte-identical builds across source/cache paths.
- Builds verify bundled asset hashes, license inventory, manifest pins and worker
  source correspondence. Normal `npm pack` runs those checks before packaging.
- Sync revalidates and replans after mid-run source-view changes and stale native
  revisions, with bounded retries and unchanged explicit targets (#172, #173).
- Explicit submission refreshes a scan left behind during proving without
  replacing finalized bytes or retrying broadcast (#174).
- Payment observation retries when the chain advances during its reads, while
  continuing to reject stable inconsistent evidence.

This prerelease is not fully release-qualified. Persistent Node storage is
Linux-only; historical wallet-database migration is unqualified. Browser reads,
funded Ironwood receipt, proving/signing and OPFS reopen passed, but the full live
browser send/receive round trip remains blocked by endpoint transaction lookup.
The Node test application uses concurrent scan/observe confirmation. The owner
controls npm publication under the `next` tag; release tracking is in issue #165.
