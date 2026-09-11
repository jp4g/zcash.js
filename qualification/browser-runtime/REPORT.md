# Browser runtime qualification report

Historical checkpoint at commit 1543132. Preserved failures below describe that
checkpoint. [The Firefox continuation](FIREFOX-REPORT.md) records subsequent
coordinator browser execution and the new runner's current status.

**Browser execution is blocked before localhost startup; zero browser passes.**
The installed Chrome executable is real, but this sandbox rejects socket creation
with `PermissionError: [Errno 1] Operation not permitted`. Browser support remains
mandatory. No alternate socket path, package install, permission change,
`--no-sandbox` flag, fake browser/import, or substituted SQLite module was used.

The owned implementation is `qualification/browser-runtime/**` on
`test/issue-2-browser-runtime`, based on `e73f423b35dffd6478d2150b7fd488064c71ddd9`.
No peer runtime, global ledger, API documentation, or dependency cache was edited.
No Cargo build was run by this worker. All data and fault injections are synthetic.

## Executed evidence

Exact commands, observed exits, source/asset hashes and external log hashes are in
[evidence.json](evidence.json). Full logs stay in
`/home/jack/zcash-browser-runtime-logs`.

| Check | Result |
| --- | --- |
| Chrome `--version` | Exit 0: Google Chrome for Testing 151.0.7922.34 |
| Node `--version` | Exit 0: v26.8.1 |
| Approved generator `--version` | Exit 0: wasm-bindgen 0.2.128 |
| Local socket creation/bind preflight | Exit 1: EPERM at `socket.socket()` before bind |
| Host tests, before implementation | Exit 1: module missing; committed tests first |
| Host adapter tests after implementation | Exit 0: two tests; real entropy, bounds, detached/refreshed views, time/sleep/loss |
| Historical authentic web bindings in Node | Exit 1: unresolved bare `runtime_host`; no fabricated resolver |
| Fresh web bindings in Node, first check | Exit 1: diagnostic inspected table end after bridge grew table |
| Corrected fresh web bindings in Node | Exit 0: inspect real generated externrefs before bridge invocation |
| Extended SQL-cycle test on older fresh artifact | Exit 1: missing `rt_cycle`, retained as red evidence |
| Current fresh web bindings in Node | Exit 0: actual same-instance SQL/BLS, growth, SQL cycles, OOM, host and pool checks |
| Current static packaging controls | Exit 0: three controls; verified assets accepted, modified worker and producer hash mismatch rejected |
| Syntax checks | Exit 0 for all ten `.mjs` files |
| Browser runtime scenarios | Unexecuted: 14 required scenarios remain pending |
| Browser harness controls | Unexecuted: 5 controls remain pending |

The initial packaging-control run failed two stdout-capture assertions; its combined
shell exit was 0 because a succeeding host-test command followed it. This is not
reported as a passing package run. Reading the runner's structured evidence fixed
capture; a subsequent directory-collision failure was then corrected. All failure
logs remain intact, including `web-binding-node-green.log`, whose optimistic
filename does **not** change its failed result.

The latest Node diagnostic instantiates genuine `--target web` output, calls its
actual generated initialization and Rust raw-export bridge, then attaches real
host services to that same memory. It executes SQL sum 42, exact blob roundtrip,
commit/rollback/integrity, actual Common BLS pairing, two retained rows, Rust
allocation with memory growth from 18,219,008 to 51,838,976 bytes, detached old
views, SQL commit/rollback/blob/integrity cycles with sums 44 then 46 while the Rust
allocation remains live, refreshed entropy writes, heap verification, SQLite OOM
with unchanged rows/integrity, pool bounds/exhaustion/canaries, and explicit
unsupported lower-host errors. Pool start is 1,180,536; Rust heap base is
17,990,592; SQLite arena is 16 MiB. These are **Node observations**, not browser
observations or performance claims.

## Current artifact and browser harness

Current stage: `/home/jack/zcash-browser-runtime-scratch/fresh-3`.
Its producer is the independently built
`/home/jack/zcash-generated-runtime-scratch/build-1789135187453484355`.
Producer receipt, before/after source snapshots, command exits and log hashes,
exact generator hash, raw hash and generated hashes were checked before staging.
The producer receipt records the base commit plus modified source snapshots;
the new runtime source is identified by those hashes, not falsely by the base
commit alone. Generated JS/WASM are copied unchanged. Earlier `fresh-1`, `fresh-2`
and historical artifacts remain preserved.

- Raw WASM SHA-256: `8f4c77fbdf8a8a13f233bfa7b5d225e00a0e12e80f7b28da7dc9cd0edf96c430`
- Generated WASM SHA-256: `b054d224151161ed550985873fdadd21caa29357ee9452bc787d2f5993768895`
- Generated glue SHA-256: `e1b1591e59e4ab554f6292d3b964385acd147ce9eda5720fe393f04f4f21d235`
- Browser probe SHA-256: `508b1e6cb34f0705cfb6ed1a49f15e5afbea41da616abc4253fb0a7c59047857`
- Producer receipt SHA-256: `bdb68f913be4e4586a46130e686eb7fb2e7a9ce924607aa24afec589b06a07d9`
- Staged manifest SHA-256: `46e30bbcfbe03c6872bee5b48a3cd7b0e6a8c090b0773fcbf982a7b6f4ee5694`

All source/host/loader/controller hashes and the reviewed six-function import
inventory are included in evidence.json. No WASI import or synthetic binding
callback is accepted. Actual generated externref initialization and same-instance
raw-export identity are checked.

The [runner command and reproduction instructions](README.md) start a dedicated
module worker for each bounded scenario. The first scenario requires SQL and BLS
in one living instance. Further probes cover canary/heap corruption detection,
pool omission, OOM, memory growth, host entropy/time/sleep and loss, and worker
termination followed by a successful zero schema-count query in fresh memdb.
Every instance is discarded after host exceptions or intentional corruption.

The page and worker must both report secure context, `crossOriginIsolated=false`
and `typeof SharedArrayBuffer === 'undefined'`; no global is deleted to manufacture
these conditions. The actual memory must be an ArrayBuffer. These flags are
**required but not observed here**. Chrome's sandbox remains enabled. Only exact
hashed assets are served from an in-memory allowlist on `127.0.0.1`; no COOP/COEP
headers are supplied. The server, browser and profile ownership are bounded;
server/browser cleanup runs in `finally`, and scratch evidence is preserved.

`Worker.terminate()` returns void. Therefore the runner requires a real CDP
`Target.targetDestroyed` event before moving on, particularly before creating the
fresh memdb worker. Timeout/error/abort/malformed-message scenarios use separately
labeled real browser-worker fixtures. They are harness controls, not runtime
thread-pool bootstrap, scanner liveness, transaction cancellation or F2 proof.

## Narrow remaining prerequisite

The coordinator must run the full README command in a foreground environment
where normal localhost sockets and Chromium's normal sandbox can operate.
This worker did not retry the denied socket operation through another mechanism.
The generator worker's independently retained launch log also reports Chrome
`setsockopt: Operation not permitted` followed by SIGTRAP; that is corroborating
peer evidence, not this worker's execution. Installed Playwright was subsequently
located at `/home/jack/.npm/_npx/e41f203b7505f1fb/node_modules/playwright`; this
harness needs no npm dependency and uses the ordinary DevTools pipe directly.

Browser execution can still expose harness defects, including DevTools target
lifecycle behavior; no browser red/green result is invented. No Rust/host-source
fix is currently requested: the current real Node diagnostic passes. Any runtime
failure found by foreground browser execution must go to its owning worker.
The browser subset, OPFS durability, scanner/threaded paths, F1 and issue #2
remain incomplete. Memdb is explicitly ephemeral; no deployment, funds,
providers, mining, publication, license choice or deferred features were touched.
