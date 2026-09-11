# Browser qualification checkpoint — 2026-09-11

Browser execution is **blocked before any page or WASM instance**. The existing
Chromium launch with its sandbox enabled exited after a denied system operation:

```text
[15:15:0911/095829.783326:ERROR:third_party/crashpad/crashpad/util/linux/socket.cc:45] setsockopt: Operation not permitted (1)
process did exit: exitCode=null, signal=SIGTRAP
```

The recording command exited **1**. No alternate browser, sandbox-disabling flags,
changed permissions, or other workaround was attempted. The owner/coordinator was
notified immediately. Chromium 1234 and Playwright 1.62.1 were already installed;
this slice installed nothing and preserved older evidence. The role was inherited
gpt-6-astra HIGH for browser ABI/runtime qualification.

## Evidence and exact commands

Full command arguments, cwd, timestamps, exit codes and log hashes are retained in
`/home/jack/zcash-generated-runtime-logs/browser/commands.jsonl`.

The sole actual launch attempt was:

```sh
TMPDIR=/home/jack/zcash-generated-runtime-scratch/browser/tmp python3 qualification/harness.py --logs /home/jack/zcash-generated-runtime-logs/browser --timeout 45 browser-sandbox-launch node -e 'const {chromium}=require("/home/jack/.npm/_npx/e41f203b7505f1fb/node_modules/playwright"); (async()=>{const b=await chromium.launch({executablePath:"/home/jack/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome",headless:true,chromiumSandbox:true}); console.log(JSON.stringify({browser:b.version(),sandbox:true})); await b.close();})().catch(e=>{console.error(e);process.exitCode=1;});'
```

Log: `browser-sandbox-launch-1789135109371254145.log` in that log directory;
SHA-256 `b74ec96f7234c1305b58cfa74f85e28a008127ec4897e9b75fbdd7394b20ea8c`.
It includes the complete generated Chromium launch arguments and process cleanup.

Validation executed in the repository root:

| Command (recorded through `qualification/harness.py`) | Exit | Meaning |
| --- | --- | --- |
| `node --test qualification/runtime/browser/test-worker-owner.cjs` before helper implementation | 1 | Expected missing-module red control |
| Same command after implementation | 0 | Synthetic lifecycle controls |
| `node qualification/runtime/browser/test-worker-owner.cjs` | 0 | Five individual controls reported passing |
| `node --check qualification/runtime/browser/worker.mjs` | 0 | Syntax only |
| `node --check qualification/runtime/browser/run.cjs` | 0 | Syntax only |
| Runner command below with `--inventory-only` | 0 | Hash-bound actual generated import/export contract; no browser launch |

The five controls cover waiting for actual observed close before replacement,
deadline cleanup, exception cleanup, rejecting missing close after termination,
and rejecting premature worker death. These use synthetic event emitters and are
explicitly not browser, SQL, crypto, or durability acceptance.

Final static inventory:
`/home/jack/zcash-generated-runtime-logs/browser/browser-1789135457334.json`.
It records final runner/worker/owner/test hashes, actual generated imports/exports,
consumer/build provenance hashes, browser executable hash and Playwright version
manifest hash. Its `browserExecution` is false and results are empty.

## Real artifact contract and prepared runner

Final web bundle: `/home/jack/zcash-generated-runtime-scratch/execution-2/web/`.
It uses the parent implementer's unedited generated `qualification.js` and WASM,
plus shared environment-neutral `loader.mjs` / `runtime-host.mjs`.
Browser worker calls the same `load({module})` and obtains actual raw exports.
Unknown imports are rejected by that loader; no WASI or generated glue is mocked.

Fresh producer:
`/home/jack/zcash-generated-runtime-scratch/build-1789135187453484355/provenance.json`.
The consumer manifest validates the producing provenance and all copied web files.

| Artifact | SHA-256 |
| --- | --- |
| Fresh `raw/issue_2_qualification.wasm` | `8f4c77fbdf8a8a13f233bfa7b5d225e00a0e12e80f7b28da7dc9cd0edf96c430` |
| Transformed `web/qualification_bg.wasm` | `b054d224151161ed550985873fdadd21caa29357ee9452bc787d2f5993768895` |
| Genuine generated `web/qualification.js` | `e1b1591e59e4ab554f6292d3b964385acd147ce9eda5720fe393f04f4f21d235` |

`run.cjs` serves only explicit fixture assets on an ephemeral loopback origin with
correct MIME types and no COOP/COEP headers. It launches Chromium with
`chromiumSandbox: true`, creates real module workers, and requires both unavailable
SAB and ordinary WASM memory. Playwright observes each worker's `close` event after
termination before any replacement worker is created. Timeout/error cleanup closes
the browser. Artifact hashes are checked before and after execution.

The eight prepared scenarios are same-instance SQLite commit/rollback/two 64-KiB
blobs/integrity plus BLS pairing, fresh empty schema after observed destruction,
pool omission, entropy unavailable, entropy lost after initialization, unknown
imports, pool canary corruption, and Rust heap corruption. The same-instance case
interleaves 8/32/64-MiB Rust growth, detached old views, refreshed real host entropy,
time/sleep, repeated SQL writes/blob/integrity, BLS pairing, pool exhaustion/OOM
and canaries. It also requires unsupported filesystem calls to fail.

**These eight browser scenarios have not executed.** Only the prepared code,
synthetic lifecycle controls and static contract inventory are qualified here.

## Resume after the environment blocker is resolved

An authorized execution environment must permit Chromium's normal required system
operations and loopback fixture serving while retaining its browser sandbox.
The coordinator must resolve that external blocker; disabling sandbox protection
or changing launcher flags to route around the denial is not this slice's remedy.
Once the environment is resolved, the complete command is:

```sh
TMPDIR=/home/jack/zcash-generated-runtime-scratch/browser/tmp python3 qualification/harness.py --logs /home/jack/zcash-generated-runtime-logs/browser --timeout 600 browser-real node qualification/runtime/browser/run.cjs --bindings /home/jack/zcash-generated-runtime-scratch/execution-2 --playwright /home/jack/.npm/_npx/e41f203b7505f1fb/node_modules/playwright --chromium /home/jack/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome --evidence /home/jack/zcash-generated-runtime-logs/browser
```

Appending `--inventory-only` is the already executed independent static check and
does not launch a browser. The resume command without that flag was **not run**.
Ordinary browser ABI/runtime failures still need diagnosis and real reruns after
launch becomes possible. Node execution of web bindings is separate evidence and
does not satisfy this required browser gate. F1 remains partial; wallet/scanner,
threaded behavior/F2 and real Node filesystem/OPFS durability/F3 remain distinct.
Memdb lifetime loss is not durable reopen evidence. No production SDK, push,
merge, global ledger or global handoff change is part of this browser checkpoint.
