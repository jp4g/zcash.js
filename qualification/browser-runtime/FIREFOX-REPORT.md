# Firefox browser qualification continuation

**PASS: 14 runtime scenarios and 5 separate browser harness controls.**
The coordinator's foreground command exited 0, including all cleanup checks.
The read-only evidence verifier also exited 0. Exact command argv, failed attempts,
log hashes, binary/source/generated/probe hashes, per-scenario results and
lifecycle event indices are checked into [firefox-evidence.json](firefox-evidence.json).

The coordinator's installed Firefox 155.0.1 and packaged geckodriver 0.37.1 execute
the authentic web module under the existing security policy. This continuation
starts from `1543132`; the [historical report](REPORT.md) and all prior failure
logs are preserved. Firefox avoids the host's Chromium “No usable sandbox”
blocker without disabling any sandbox or changing host policy.

Earlier coordinator evidence in `/home/jack/zcash-browser-runtime-logs`:
`coordinator-firefox-same-instance.json` contains actual same-instance SQL total
42, two rows, and Common BLS pairing 1. `coordinator-firefox-controls.json` records
additional real browser execution and harness controls. Both page and worker
report secure context, non-isolation and unavailable SAB. Those runs use the
older fresh WASM `f5303cdee592378d74e2414b91753279f9668f16d1b9f92cd7f9e2af52ba7f72`
and do not independently establish worker destruction. They are not counted as
the current `fresh-3` full-suite lifecycle proof.

The new [runner](run-firefox.mjs) uses the existing `fresh-3` bundle unchanged,
with generated WASM `b054d224151161ed550985873fdadd21caa29357ee9452bc787d2f5993768895`.
It verifies every executable asset and the pinned checked-in manifest before
freezing all served bytes in memory. It then creates its own localhost server,
driver listener, Firefox profile and WebDriver/BiDi session. There is no install,
security policy change, reuse of old sessions, or generated-glue modification.

The lifecycle auditor requires one matching pair of externally received worker
creation/destruction events per scenario, belonging to the known page realm and
origin (or Firefox's exact expected worker script URL). It rejects missing events, extra workers, incorrect ownership, stale
events and destruction preceding creation. The pre-start-abort control must
create no worker. The runner also requires an empty live-worker realm inventory
before advancing. Consequently `destruction-fresh` cannot run until the original
worker's external destruction has been observed. This uses the standard
[WebDriver BiDi realm events and inventory](https://www.w3.org/TR/webdriver-bidi/#module-script),
not a worker message or the return of `Worker.terminate()`.

`node qualification/browser-runtime/test-firefox-lifecycle.mjs` ran red with
exit 1 before the auditor existed (`firefox-lifecycle-red.log`), then green with
exit 0 and three unit controls (`firefox-lifecycle-green.log`). These synthetic
event-audit controls are host tests, not browser results. Syntax checks passed.

The [foreground command](README.md) was published early in
`/home/jack/zcash-browser-runtime-logs/firefox-runner-ready.md`. Two genuine host
failures were preserved and corrected. First, geckodriver rejected the Snap
launcher as a binary. The default now lets packaged geckodriver select its actual
executable; explicit valid binaries remain opt-in. Second, Firefox emitted a full
worker script URL in the realm `origin` field. The auditor now accepts only the
exact expected worker URL or standard page origin, preserving the strict owner
and destruction requirements. Both corrections ran red/green regression controls:
four lifecycle tests and two binary-selection tests, all green with exit 0.

The successful command is the README command with no `--firefox` override, using
Node v26.8.1, Firefox 155.0.1 and geckodriver 0.37.1. Execution began at
2026-09-11 14:24:29 UTC and cleanup completed at 14:24:40 UTC. These times identify
the run; they are not performance qualification. Browser data is in
`/home/jack/zcash-browser-runtime-logs/firefox-1789136669817.json`, with SHA-256
`0fb2a7b30de32fe6c86907e452114a1b056f4edd2d2baea496f86ceba9e5110e`.
The adjacent JSONL and driver log and `coordinator-firefox-runner-3.log` retain
actual output. The earlier `...6397946...` and `...6502838...` results exited 1.

| Browser runtime scenarios | Actual result |
| --- | --- |
| Same instance SQL + Common BLS | SQL total 42, two rows, pairing 1 |
| Pool bounds/alignment/exhaustion/canaries | Pass; arena 16 MiB, start 1,180,536, Rust heap base 17,990,592 |
| Actual canary and heap corruption | Both detected; instances discarded |
| SQLite OOM | Expected SQLite OOM, integrity and rows preserved |
| Rust growth with live SQL state/mutations | 18,219,008 → 51,838,976 bytes; detached old views, refreshed entropy, repeated commit/rollback/blob/integrity, heap/pool/pairing checks |
| Host entropy/time/sleep | Real callbacks and Julian time range pass; unsupported lower-host errors remain explicit |
| Omitted pool | Initialization/open fail as required |
| Entropy unavailable, entropy loss, time loss, sleep loss | All expected failures observed; workers discarded |
| Destruction original/fresh | Original SQL+pairing pass; external destruction precedes replacement; fresh schema count is 0 |

The five separate browser harness controls—bootstrap timeout, bootstrap error,
active cancellation, pre-start cancellation, malformed result—all passed. They
are not threaded-runtime bootstrap or cooperative Rust-cancellation proof.
Host unit tests remain separate from these real browser controls.

Both page and all 14 runtime worker contexts report `secure=true`,
`isolated=false`, `sab="undefined"`; workers identify as dedicated workers and
use non-shared WASM memory. No global was overridden to manufacture this state.
There are 18 unique worker realms with matching external destruction events;
the pre-start-cancellation case has zero realms. The memdb original realm
`23f50b77-8e2b-4027-846f-ee38c581437b` was created/destroyed at event indices 29/30.
Only afterward did fresh realm `92edf589-fd87-4eb1-b065-ce239f85b906` appear at
indices 31/32. The verifier independently checks those event/order relationships,
all exact scenario counts, manifest/fixture hashes, baseline flags and cleanup.
It rejects the earlier failed run (exit 1) and accepts the complete run (exit 0).

Final cleanup records `sessionDeleted=true`, `processGroupGone=true`,
`browserProcessGone=true`, and `loopbackServerClosed=true`. The runner source and
both helper hashes match the source that the successful run recorded; no runtime
code was changed after that execution. Missing creation/destruction capabilities
still fail closed. No negative probe was omitted or relaxed.

This is ephemeral synthetic memdb qualification. It does not complete issue #2,
F1, scanner behavior, filesystem/OPFS durability, threading, production packaging,
or the SDK. No chain/provider/funds, deployment, publication, license choice or
deferred features are involved.
