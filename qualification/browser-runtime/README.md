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
