# Actual Firefox quota qualification (bounded F3 slice)

`quota-*` adds a disposable browser experiment around the immutable accepted
stage-4 wallet bundle. It does not build or alter Rust, crypto, SQLite, generated
wasm-bindgen output, or dependencies. It is not production SDK integration.

The host gate is **pending** until a real Firefox result passes. Offline controls
and injected DiskFull/DOMException controls do not establish actual quota.

The sequence imports the synthetic account, scans batches [0,1), [1,2), [2,4),
closes and destroys its worker, and checks exact populated state after reopen.
A separate OPFS filler file in that wallet's owned namespace exhausts native quota
within 64 MiB and 12 seconds. The harness retains all but 16 KiB of filler to
allow real journal writes in the final [4,7) scan. Failure must be a native
`DOMException` named `QuotaExceededError`, thrown by an actual SQLite-owned
`wallet.db` or `wallet.db-journal` write/truncate/flush while that scan runs.
The backend observer rethrows the same error into the accepted VFS error mapper;
it does not replace native handles, globals, generated glue, or database code.
Fault/crash commands are rejected by this harness.

Successful writes and SQLite FULL must appear in the untruncated scan VFS trace.
After external BiDi confirmation of worker destruction, reopen must exactly
match the full pre-failure observation: every persisted table/column value and
SQLite type, public metadata, opaque UUID, balances, migrations, integrity and
tree state represented by the accepted observer. Only then is `quota-filler`
removed. Retry must match the accepted native imported-account reference, retain
exact account rows, validate final roots/witnesses/balances, and survive another
close/destroy/reopen with exact full state. Physical database bytes are not the
comparison: SQLite's logical full persisted state is. Native parity alone
canonicalizes UUID; rollback and reopen equality never do.

`quota-host.py freeze` verifies the pinned accepted manifest and complete bundle
inventory, copies the bundle to owned scratch, and adds only qualification JS.
It reuses the pinned `run-firefox.mjs` and static responder. Narrow adaptations
set `dom.quotaManager.temporaryStorage.fixedLimit=32768` in the fresh profile,
place generated profiles under owned scratch, expose the existing BiDi event list
through the existing responder without modifying globals, and record capabilities.
The browser page retains the accepted lifecycle barriers and request deadlines.
No testing preference, sandbox override, install, or external network dependency
is introduced. The intended quota must be confirmed by measured estimates and
native errors on the installed browser; a preference/source reference is not proof.

Reproduce with already installed Node, Python, Firefox and `/snap/bin/geckodriver`:

```sh
python3 qualification/wallet-durability/quota-host.py freeze /home/jack/zcash-browser-quota-scratch/NEW-PACKAGE
# Use the printed immutable package path and manifest digest:
timeout --kill-after=10s 260s python3 /home/jack/zcash-browser-quota-scratch/NEW-PACKAGE/quota-host.py run /home/jack/zcash-browser-quota-scratch/NEW-PACKAGE PRINTED-MANIFEST-SHA256
```

Each host run writes a unique `host-*` evidence directory under
`/home/jack/zcash-browser-quota-logs`, including the package receipt, console,
existing runner driver/result records, and exit/profile-cleanup record. The exact
frozen package-1 command is in that directory's `checkpoint.md`. All failed
attempts remain. The wrapper allows 215 seconds before terminating the accepted
runner, then 25 seconds for cleanup. The runner itself retains its 180-second
suite timeout and bounded session cleanup. The foreground command has a total
270-second outer bound. Filler growth never exceeds 64 MiB, even if the installed
browser ignores the quota preference; that case fails the gate. Only this run's
namespace/profile/resources are cleaned. Removing owned files is not eviction.

Runnable controls (synthetic handles in the small cap/error control are explicitly
not browser evidence; the separate Node control uses real accepted Wasm/SQLite):

```sh
node qualification/wallet-durability/quota-test.mjs
timeout --kill-after=5s 60s node qualification/wallet-durability/quota-test-node.mjs
python3 -I qualification/wallet-durability/quota-test-host.py
python3 -I -O qualification/wallet-durability/quota-test-host.py
STORAGE_RUNNER_SOURCE=/home/jack/zcash-browser-quota-scratch/package-1/run-firefox.mjs node --experimental-vm-modules qualification/storage/test-firefox-lifecycle.mjs
```

The package-integrity controls require frozen package-1 and mutate private copies
of its real files/manifest. No original artifacts, source, caches or logs are
modified. Detailed local evidence is in `REPORT.md` under the quota logs, separately
from `CLIresult.md`. Independent HIGH review is coordinator-owned. Eviction,
restore, other F3 gates and issue #2 remain open regardless of this result.

## Host-1 diagnostic follow-up (package 2)

Actual host 1 ran Firefox 155.0.1 and passed the populated baseline. Its next
`pressure` command failed, but worker and page serialized `Error.stack` alone;
Firefox's recorded stacks omitted the original name/message. That evidence cannot
identify the underlying pressure error. Package 1 and its failed result are retained.

Package 2 preserves name, message, stack, textual error and native code separately
at both boundaries; the suite also retains the original failed command reply.
Pressure diagnostics include the step, filler write offset/length/bytes/errors,
and storage estimates on error. These fields do not establish quota acceptance.
The standard preference, cap, deadline, filler refinement, headroom and every
native-error/FULL/rollback/retry/identity requirement are unchanged. No pressure
behavior fix is justified until the original native failure is observed.

```sh
node --experimental-vm-modules qualification/wallet-durability/quota-test-errors.mjs /home/jack/zcash-browser-quota-scratch/package-2
python3 -I qualification/wallet-durability/quota-test-host.py /home/jack/zcash-browser-quota-scratch/package-2
python3 -I -O qualification/wallet-durability/quota-test-host.py /home/jack/zcash-browser-quota-scratch/package-2
```

The error transport control executes the real worker handler and exact suite/page
error boundaries with an offline failing storage call, and executes no wallet or
crypto. It tests observability, not a quota pass. The manifest control now accepts
an optional package path. Package-2 host command is in the quota logs' checkpoint;
continuation evidence is separate in `REPORT-r2.md` and `CLIresult-r2.md`.
