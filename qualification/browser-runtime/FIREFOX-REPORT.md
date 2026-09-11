# Firefox browser qualification continuation

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
origin. It rejects missing events, extra workers, incorrect ownership, stale
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
`/home/jack/zcash-browser-runtime-logs/firefox-runner-ready.md`. At this checkpoint
the coordinator's new full-suite result is pending. Required counts remain 14
runtime scenarios and 5 separately labeled harness controls; none is skipped.
Missing browser realm capability must fail the run. The runner records versions,
context flags, source/asset/binary hashes, scenario results, lifecycle events and
cleanup outcomes in timestamped JSON/JSONL plus a separate driver log.

This is ephemeral synthetic memdb qualification. It does not complete issue #2,
F1, scanner behavior, filesystem/OPFS durability, threading, production packaging,
or the SDK. No chain/provider/funds, deployment, publication, license choice or
deferred features are involved.
