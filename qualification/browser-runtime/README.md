# Browser runtime qualification

Disposable, synthetic issue #2 qualification in a real dedicated browser worker.
The baseline requires a secure loopback page and worker with
`crossOriginIsolated === false`, `typeof SharedArrayBuffer === 'undefined'`,
and non-shared WASM memory. The same generated instance must execute bundled
SQLite transaction/blob/integrity fixtures and Common 1.0 BLS pairing.

The coordinator has executed real Firefox 155.0.1 with packaged geckodriver
0.37.1 under unchanged security policy. The earlier Firefox subset used older
fresh artifacts and lacked independent worker-destruction evidence. The current
runner executes all 14 runtime and 5 harness scenarios from `fresh-3`, requiring
external BiDi realm creation/destruction before every replacement worker.
See [Firefox evidence and status](FIREFOX-REPORT.md).

This implementer's sandbox still rejects sockets. Chromium on the foreground
host separately fails with “No usable sandbox”; Firefox is the supported
execution path being qualified. No security policy changes or sandbox-disabling
flags are used.

Memdb is ephemeral. This does not qualify OPFS durability, scanner liveness,
threading, F1 as a whole, or issue #2 completion. Host adapter unit tests and
browser bootstrap controls are separate from actual WASM runtime results.

See [REPORT.md](REPORT.md) for executed commands/results and
[evidence.json](evidence.json) for source, raw, generated, probe and log hashes.

The staged current bundle is
`/home/jack/zcash-browser-runtime-scratch/fresh-3`. It uses the generator worker's
fresh build `build-1789135187453484355`; generated JS/WASM remain byte-identical.
Our worker-local host adapter adds bounded time/sleep loss controls. No generated
internals or alternate SQLite module are supplied.

Run Firefox from this worktree in the coordinator's foreground environment with normal
localhost/browser access (no package installation needed):

```sh
node qualification/browser-runtime/run-firefox.mjs --artifacts /home/jack/zcash-browser-runtime-scratch/fresh-3 --logs /home/jack/zcash-browser-runtime-logs --scratch /home/jack/zcash-browser-runtime-scratch --geckodriver /snap/bin/geckodriver
```

The runner owns a fresh Firefox profile, session, localhost geckodriver endpoint,
BiDi socket and asset server. It freezes and verifies assets before binding.
The original worker must have matching `script.realmCreated` and
`script.realmDestroyed` events from Firefox before a replacement worker starts;
`script.getRealms` must independently show no live dedicated workers. Missing
creation/destruction capability fails closed. Context flags are checked in both
page and worker. A 180-second outer deadline and bounded protocol/worker deadlines
lead to `finally` cleanup, with explicit resource outcomes in the evidence.
The historical Chromium `run.mjs` is retained, including its original failures.

The 14 runtime scenarios include same-instance SQL/pairing, pool bounds/canaries,
OOM, live Rust growth interleaved with SQL mutations, host services/loss, omitted
pool, actual canary/heap corruption detection, and memdb destruction/freshness.
Five separate **harness controls** exercise worker bootstrap timeout/error,
active/pre-start abort, and malformed-result rejection. They do not prove a
threaded runtime's bootstrap, scanner liveness, or cooperative Rust cancellation.

Independent checks that do not start a browser:

```sh
node qualification/browser-runtime/test-host.mjs
node qualification/browser-runtime/test-firefox-lifecycle.mjs
node qualification/browser-runtime/test-package.mjs /home/jack/zcash-browser-runtime-scratch/fresh-3
node qualification/browser-runtime/diagnostic-node.mjs /home/jack/zcash-browser-runtime-scratch/fresh-3
```

The last command executes real web bindings **in Node**. It is a useful integration
diagnostic, never a browser pass. Add `--verify-only` to the full runner command
to verify staged files without opening a socket or launching Chromium.

To stage another verified fresh build, use a new output directory (existing
outputs are never overwritten):

```sh
node qualification/browser-runtime/prepare.mjs --generated /home/jack/zcash-generated-runtime-scratch/build-1789135187453484355/web --raw /home/jack/zcash-generated-runtime-scratch/build-1789135187453484355/raw/issue_2_qualification.wasm --provenance /home/jack/zcash-generated-runtime-scratch/build-1789135187453484355/provenance.json --output /home/jack/zcash-browser-runtime-scratch/fresh-next
```

The preparer checks producer command exits/log hashes, generator hash, source
snapshots before/after building, raw/generated hashes, required exports and the
reviewed six-import contract. The localhost server freezes verified file bytes
in memory. This disposable server/loader does not implement the production H1
manifest protocol or establish production packaging/CSP compatibility.
