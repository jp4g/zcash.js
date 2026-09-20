# Running tests

For development use Node ^22.13.0 or >=24, as required by ESLint. From a fresh checkout:

```sh
npm ci
npm run check
```

`check` runs ESLint, builds the current source into `dist/`, and runs every
`tests/*/*.test.mjs` suite, with at most four test files running concurrently
to bound native worker and bundler resource use. `npm test` does the same build and tests without
linting; `npm run test:sdk` runs only the SDK subset. No external source tree,
old build directory, Rust compiler, or live blockchain endpoint is needed.

Native integration tests execute the pinned WASM in [fixtures/](fixtures/README.md).
Missing or modified fixtures fail rather than silently skipping native coverage.
All source-under-test imports use the current repository's `dist/` directory.
When invoking a test file directly, run `npm run build` first.

`tests/wallet/bundled.test.mjs` also opens the shipped runtime and verifies the
included proving files offline, without explicit runtime or asset-loader options.
The packed Node consumer rejects missing/corrupted installed WASM.

For a fresh, genuinely installed Node/Vite/Firefox consumer, run:

```sh
npm run test:package:browser
```

This installs the tarball and npm dependencies in a new sibling project, builds
a nested-base Vite application, checks lazy network loading and OPFS persistence,
and retains `result.json`, asset sizes, a tarball digest and Node memory snapshots.
It needs registry access, Firefox and geckodriver. This is not a live-chain test;
the separate [testnet application](../examples/testnet/README.md) requires funding
and the appropriate network endpoint. Publication and live acceptance status are
tracked in [the release report](../docs/planning/single-import-release.md).

For an opt-in runtime recovery check, close a testnet wallet containing an
observed finalized payment, let it fall behind the chain, then run:

```sh
node tests/wallet/runtime-recovery-live.mjs /absolute/path/to/closed-wallet revision
node tests/wallet/runtime-recovery-live.mjs /absolute/path/to/closed-wallet source-change
```

Each run locks and copies the database into a private temporary directory, then
tests the bundled native runtime without submitting a payment or changing the
original wallet. `revision` records a real native observation between planning
and ingest, verifies stale-plan rejection, and requires successful replanning.
`source-change` injects one synthetic changed predecessor into a live source and
requires a fresh validated pass. Both retain transaction identity and attempts;
the latter is not a simulated consensus reorg. The temporary copy is removed on
exit. These checks require the public testnet endpoint, not recovery material.

`npm run test:package:node` runs only the clean installed Node portion, without
building or launching the browser application. To compare the same installed
engine loaded locally versus externally, run
`node scripts/compare-wallet-memory.mjs CONSUMER CERT KEY` with that retained
consumer and a locally trusted TLS certificate/key. The child processes trust
only the supplied additional CA; certificate verification is not disabled.

## Optional browser and TLS tests

The Node suite includes mocked browser-runner lifecycle checks and a VM bundle
check. Those do not claim real browser coverage. Actual browser runners require
Linux, Firefox, and a compatible geckodriver on PATH. Set `GECKODRIVER` to choose
another driver executable; let that driver select its Firefox executable.

```sh
npm run test:sdk:real-firefox
npm run build
node tests/clients/grpc-web-browser.mjs
node tests/clients/public-chain-reads-browser.mjs
node tests/clients/public-block-reads-browser.mjs
node tests/clients/public-transaction-reads-browser.mjs
node tests/clients/light-chain-reads-browser.mjs
node tests/clients/light-transparent-reads-browser.mjs
node tests/clients/light-server-observation-browser.mjs
node tests/wallet/host-browser.mjs
```

These use local fixture servers and write logs/profiles under the ignored
`.local/tests/` directory by default. Existing per-runner `*_LOGS` and `*_SCRATCH`
environment variables override output locations only. Build overrides have been
removed so a runner cannot accidentally test a stale SDK build.

The artifact HTTPS test explicitly skips unless `ARTIFACT_TLS_CERT` and
`ARTIFACT_TLS_KEY` name local certificate/key files. To run it, provide those
variables and trust the test certificate for that Node process with
`NODE_EXTRA_CA_CERTS`. Never commit the private key. The artifact browser runner
also requires `ARTIFACT_WEBDRIVER` and a Firefox profile that trusts the certificate;
it does not disable certificate validation. See its entrypoint in
`runtime/artifacts-browser.mjs` for the optional hostname/profile variables.

Documentation checks remain available as `npm run docs:typecheck`,
`npm run docs:check-recovery`, and `npm run docs:build`.

Advanced wallet runtime runners accept explicitly supplied runtime packages and proving
parameters through `WALLET_*` variables. Those optional runs are separate from the
self-contained Node suite and default OPFS bridge test; TLS runs also require
`WALLET_TLS_KEY` and `WALLET_TLS_CERT`.

Advanced signer runs read `bundle/tests/signer-fixture.json` from the supplied
native packet, or `WALLET_SIGNER_FIXTURE`; its original receipt hash is still required.
