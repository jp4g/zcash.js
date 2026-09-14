# Running tests

For development use Node ^22.13.0 or >=24, as required by ESLint. From a fresh checkout:

```sh
npm ci
npm run check
```

`check` runs ESLint, builds the current source into `dist/`, and runs every
`tests/*/*.test.mjs` suite. `npm test` does the same build and tests without
linting; `npm run test:sdk` runs only the SDK subset. No external source tree,
old build directory, Rust compiler, or live blockchain endpoint is needed.

Native integration tests execute the pinned WASM in [fixtures/](fixtures/README.md).
Missing or modified fixtures fail rather than silently skipping native coverage.
All source-under-test imports use the current repository's `dist/` directory.
When invoking a test file directly, run `npm run build` first.

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
node tests/clients/light-chain-reads-browser.mjs
node tests/clients/light-transparent-reads-browser.mjs
node tests/clients/light-server-observation-browser.mjs
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
