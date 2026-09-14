# Real Firefox consumer qualification

This harness tests the current checkout's packed SDK in an actual Firefox
browser. It does not qualify a public client (none is exported), CORS, an
external provider, wallet support, or WASM execution. The internal `readRpc`
hook is test access to packed code, not a supported package subpath.

On Linux, install compatible Firefox and geckodriver executables, then run:

```sh
npm ci
npm run test:sdk:real-firefox
```

`geckodriver` is resolved from PATH; use `GECKODRIVER` or `--geckodriver` to
select another executable. Let the driver select its matching Firefox binary.
Logs and scratch files default to `.local/tests/sdk-firefox/` within the repo;
`--logs` and `--scratch` can override them. No browser is downloaded by the
runner, and no browser security settings are weakened.

The shared `tests/support/firefox-options.mjs` helper sets headless mode. The
runner owns its temporary listeners, profiles, and child processes and cleans
them up on success, failure, or interruption.

The runner rebuilds, packs offline with scripts disabled and a run-owned npm
cache, extracts its own tarball, and resolves a browser bundle's `zcash.js` import
from that extracted package. It serves only an in-memory allowlist of packed
built JS, bundled/probe artifacts, a tiny HTML shell, and synthetic fixtures.
Both HTTP listeners bind `127.0.0.1` at port zero. The synthetic response splits
inside a UTF-8 character across writes; browsers may coalesce network chunks.
The probe imports actual packed ESM and the packed consumer bundle in Firefox,
checks exports/amounts/IDs, traps and counts Worker/SharedWorker/WebAssembly and
network APIs during import and transport construction, and restores descriptors
before local HTTP tests. The observation window includes 100ms of queued work;
it is not a proof against arbitrarily delayed initialization. CSP restricts the
fixture page to its own origin and disallows workers. No eager Worker/WASM access
is permitted even if SDK code catches a thrown trap.

Browser negative controls require a Worker-using module to fail under the trap
and an unsupported named SDK import to fail native ESM linking. No-socket
regressions additionally reject changed/missing artifact bytes and eager/missing
result evidence. HTTP assertions cover exact numbers beyond MAX_SAFE_INTEGER,
POST parameters/string request IDs/content type, valid and invalid streamed UTF-8,
a stalled-body deadline, caller abort after server-confirmed dispatch, and a
sanitized structured RPC error on HTTP 500 with three permitted attempts but
exactly one observed request. All five RPC requests are counted server-side.

WebDriver script/page deadlines are 20s/15s, startup is 15s, command subprocesses
are 30s, and the suite abort timer is 120s. Cleanup has separate bounded waits,
deletes the session, signals only the owned process group and exact browser
PID/start time, and checks their disappearance. Failures and cleanup failures
exit nonzero. Run-owned artifacts and JSON/driver logs are retained for review;
the successful run's extracted consumer is removed. This is a foreground runner.

Each JSON report records source HEAD, accepted source commit, tarball SHA-256,
every served asset's SHA-256/byte count, harness hashes, exact capabilities and
versions, claims/results, wire requests, and cleanup. It builds the current working tree, including uncommitted changes, and hashes
the packaged/served bytes. A `prepared-only` report contains **no browser claims**;
the source HEAD alone is not a claim that the working tree was clean.

No-socket checks:

```sh
node tests/sdk/real-firefox.test.mjs
npm run test:sdk:real-firefox -- --prepare-only
```
