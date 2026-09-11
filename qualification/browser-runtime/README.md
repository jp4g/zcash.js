# Browser runtime qualification

Disposable, synthetic issue #2 qualification in a real dedicated browser worker.
The baseline requires a secure loopback page and worker with
`crossOriginIsolated === false`, `typeof SharedArrayBuffer === 'undefined'`,
and non-shared WASM memory. The same generated instance must execute bundled
SQLite transaction/blob/integrity fixtures and Common 1.0 BLS pairing.

Current execution blocker: this implementer's sandbox rejects socket creation
with `EPERM` before localhost binding. No browser runtime pass is claimed.
Installed Chrome for Testing reports version 151.0.7922.34. Foreground execution
is required; no permission or sandbox bypass is part of this harness.

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

Run from this worktree in the coordinator's foreground environment with normal
localhost/browser access (no package installation needed):

```sh
node qualification/browser-runtime/run.mjs --artifacts /home/jack/zcash-browser-runtime-scratch/fresh-3 --logs /home/jack/zcash-browser-runtime-logs --scratch /home/jack/zcash-browser-runtime-scratch --chrome /home/jack/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome
```

The runner preserves Chromium's sandbox, uses a fresh scratch profile and a
loopback-only ephemeral port, and closes the server/browser in `finally`.
DevTools uses a pipe, with no debugging TCP port. It logs Chrome's actual version,
page/worker secure/isolation/SAB flags, asset hashes and per-worker target
destruction. The original worker must have a CDP `Target.targetDestroyed` event
before the fresh worker's successful schema-absence query. A termination request
alone cannot pass. Foreground execution may reveal browser-specific harness
defects; that code has not executed here.

The 14 runtime scenarios include same-instance SQL/pairing, pool bounds/canaries,
OOM, live Rust growth interleaved with SQL mutations, host services/loss, omitted
pool, actual canary/heap corruption detection, and memdb destruction/freshness.
Five separate **harness controls** exercise worker bootstrap timeout/error,
active/pre-start abort, and malformed-result rejection. They do not prove a
threaded runtime's bootstrap, scanner liveness, or cooperative Rust cancellation.

Independent checks that do not start a browser:

```sh
node qualification/browser-runtime/test-host.mjs
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
