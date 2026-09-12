# Real Firefox consumer qualification

This harness targets the reviewed public network descriptor at `1f8d885`. It
qualifies packed ESM and bundled `defineNetwork` with actual host-local Rust WASM.
It does not qualify a public client (none is exported), CORS, an external provider,
wallet execution, the H1 configurable runtime contract or completion of issues #6/#8. The internal `readRpc` hook is
explicit test access to packed code, not a supported package subpath.

From this worktree, on the coordinator's socket-permitted Linux host with the
already installed packaged Firefox **155.x** and geckodriver **0.37.x**:

```sh
npm run test:sdk:real-firefox -- --logs /home/jack/zcash-agnostic-browser-logs --scratch /home/jack/zcash-agnostic-browser-scratch --geckodriver /snap/bin/geckodriver
```

No browser install is performed. Omit an explicit Firefox binary: packaged
geckodriver selects its matching executable. The runner imports the measured
`qualification/browser-runtime/firefox-options.mjs` helper and follows that
runner's ephemeral listener/profile and owned process-group/PID start-time
cleanup approach; it does not execute or change WASM qualification scenarios.
Only `-headless` is passed to Firefox. No security flags, preferences, runtime
dependencies, external provider, publication, or package scripts are introduced.
The repository's existing development dependencies must already be installed;
`npm ci --offline --ignore-scripts --no-audit --no-fund` is the permitted setup.

The runner rebuilds, packs offline with scripts disabled and a run-owned npm
cache, extracts its own tarball, and resolves a browser bundle's `zcash.js` import
from that extracted package. It serves only an in-memory allowlist of packed
built JS/MJS, bundled/probe artifacts, a tiny HTML shell, and synthetic fixtures.
Both HTTP listeners bind `127.0.0.1` at port zero. The synthetic response splits
inside a UTF-8 character across writes; browsers may coalesce network chunks.
The probe imports actual packed ESM and the packed consumer bundle in Firefox,
checks exports/amounts/IDs, traps and counts Worker/SharedWorker/WebAssembly and
network APIs during import and transport construction, and restores descriptors
before explicit network-constructor and local HTTP tests. The observation window includes 100ms of queued work;
it is not a proof against arbitrarily delayed initialization. CSP restricts the
fixture page to its own origin and disallows workers; `wasm-unsafe-eval` permits
only the native compilation needed by the explicit network constructor. No eager Worker/WASM access
is permitted even if SDK code catches a thrown trap.

The network probe then calls both actual package forms with copied parameters,
pre-aborted and immediately aborted calls, malformed/oversize inputs and a synthetic
abort event. It counts exactly one native module/instance per independent package
form, zero workers/fetch calls and unchanged descriptor identity after caller
mutation. Native initialization remains absent until an uncancelled constructor.

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
versions, claims/results, wire requests, and cleanup. It rejects changes to
`src`, the TypeScript configuration, or lockfile relative to the accepted commit.
A `prepared-only` report contains **no browser claims**. Source HEAD plus harness
hashes also distinguish uncommitted harness preparation from a committed run.

No-socket checks:

```sh
node tests/sdk/real-firefox.test.mjs
npm run test:sdk:real-firefox -- --prepare-only
```

Historical original harness validation on 2026-09-11: the real command exits 1 at loopback `EPERM`
before browser launch, with an explicit host command and cleanup evidence.
Preparation and harness regressions pass; actual Firefox execution and independent
HIGH review remain coordinator work. Node VM execution and Vite bundling are not
reported as actual Firefox qualification.

Public network validation on2026-09-12 passed with actual packaged Firefox:
`/home/jack/zcash-public-network-logs/real-firefox-DBqdIY.json`. Both package forms
created one native module/instance each, with zero eager accesses, constructor
fetches or workers; four cancellation checks passed. All31served assets and four
executable harness hashes were compared to retained/current bytes. Session,
process-group, browser-process and server cleanup all passed. Source is1f8d885;
this later harness commit changes no production source.

The public LightClient matrix runs all eleven methods through the packed ESM
entry and consumer bundle against the same synthetic gRPC-Web fixture. It uses
verified transaction corpus bytes and checks read cancellation, pending-stream
return, and an unknown broadcast outcome after dispatched cancellation. The
receipt retains every request payload and requires all response connections to
close, in addition to the existing browser/session/server cleanup checks. This
qualifies the public transport composition, not wallet sync or live providers.
