# Private network and transaction binding consumption qualification

Only this subtree belongs to this workstream. Public SDK exports, clients, the
accepted network-parameters qualification crate and other workers are unchanged.
The production Rust crate and generated output ownership are in the private
`/home/jack/zakura-wasm-bindings` repository, related to zcash.js #4.

`pin.json` is created only after a real committed-source private build. It records
that exact local repository, full revision and `build.json` SHA-256. No placeholder
pin is supplied when the producing commit is blocked. `pin.mjs` is an explicit
one-time local pin creation (`wx` prevents silently replacing an existing pin).

For an initial pin only, run `pin.mjs` once. To replace a committed pin, preserve
its bytes and explicitly update its revision and metadata digest after a real build;
do not rerun exclusive creation over it. After a successful build:

```sh
REPRO=$(mktemp -d /home/jack/zakura-bindings-network-scratch/consumer-repro.XXXXXX)
node qualification/private-bindings-consumer/verify.test.mjs /home/jack/zakura-bindings-network-scratch/combined-packet-1 "$REPRO"
node qualification/private-bindings-consumer/prepare.mjs /home/jack/zakura-bindings-network-scratch/combined-packet-1 "$REPRO/package"
node "$REPRO/package/node.mjs" "$REPRO/package"
```

The local verifier checks the independently pinned metadata digest, revision,
actual Git commit/tree/lock and all seven fixed files' exact hashes/lengths, with
bounded reads, before making executable copies. The negative suite corrupts the
metadata and every file, changes revision/hash expectations, and checks absence.
Corrupted artifacts must fail before `prepare.mjs` creates any executable output.
This is a small local integration qualifier, not H1 artifact authentication.

Preparation writes a new package from verified in-memory bytes; it does not verify
a source path then copy it again. Node imports those verified copies and explicitly
supplies WASM bytes to the binding's initializer. The package contains the same
196 reviewed synthetic document cases and additional JS admission controls.
`vectors.mjs` is copied unchanged from accepted SDK revision a280d31; branch golden
values in `behavior.mjs` are test-only observations of locked protocol 0.10.6.

For Firefox, pass the SHA-256 digest of the new package's `SHA256SUMS` as the runner
argument. Pin/check the runner's own digest before execution. The checkpoint emits
the exact command. The runner verifies every package file once, serves those same
in-memory bytes on loopback, starts an ordinary page-owned module script, and uses
WebDriver only to read its result. Firefox confinement, startup/execution limits,
certificate policy and cleanup are retained from accepted a280d31. No WebDriver
import or security override is used. Try ordinary execution under existing confinement; parent executes the exact package if worker loopback sockets are denied.

The historical network-only pin selected private revision
`9ee26e66833d6d0fbb1ca2382e0a0881ac373f33` and build metadata SHA-256
`c9992802524c2a624b5a5f9506c485d24d5f1f3f3be98e331b94e55153c019b0`.
Rebuild from a detached checkout of that exact revision, not a later main HEAD.
Two fresh committed-source builds (normal Python and `-O`) match byte-for-byte.
Both original P2 findings are fixed and independently accepted: unconditional
producer gates and intrinsic backing-store admission before generated glue.
Actual pinned Node passes 196 cases plus 29 admissions; all nine historical pin/file rejection
controls pass. Actual Firefox passes 196 cases plus 28 admissions, with complete
session/driver/server cleanup and unchanged confinement. The verified package is
`/home/jack/zakura-bindings-network-scratch/combined-browser`, inventory digest
`d44e6169420ce1388edc528c26bb8f6ff5622b9035031a15e530dd581c44f0b2`.
The commands above use a fresh reproduction output because preparation is exclusive.
Historical failed and R1-only packets remain preserved, not selected.
Final browser receipt: `/home/jack/zakura-bindings-network-logs/browser/firefox-1789155133656.json`,
SHA-256 `55f48e9e003e1de954cd3d6c7472b6b670401eef4619266180ec7596e1857edd`.
Independent final review: `/home/jack/zakura-bindings-network-logs/review/r2/REPORT.md`
and `verdict.json`.

No complete runtime profile, executable host loader, worker/ABI negotiation,
network registration, public defineNetwork or client genesis verification is
claimed. Wallet/storage/signing/proving/outbox remain separate gates.

## Current transaction producer and consumer

This branch updates the pin only after two genuine byte-identical builds of private
`70d1c0ec44b56333b84adf7d57e455b291cd85ff`, from accepted main `3593a67`.
`pin.json` now selects `/home/jack/zakura-transaction-bindings` and metadata SHA256
`d59dc6af3108dc68e70b5060e1e83b6a6dcbb7c35943724774593d53eb38fa9f`.
The old `9ee26e6`/`c9992802` pin and evidence above remain valid historically;
exclusive `pin.mjs` creation was not used to overwrite them.

The new `zakura-bindings-build/1` packet adds `bytes.mjs` and `transaction.mjs`.
Verification requires exact metadata and physical packet inventories, checked
commit/tree/lock, and owned bounded file bytes. The metadata cap is 128 KiB to
accommodate the actual locked Common feature graph (49,404 bytes in this build).
All 18 negative pin/hash/inventory/source/length controls pass.

`decodeTransaction(raw, branch)` is a private checked byte/identity codec; production
Rust stays entirely private. The SDK's existing transaction qualification and
its source corpus are unchanged. Preparation authenticates that corpus's fixed
SHA256 before copying it as `transaction-vectors.json`. The shared runtime cases
exercise all 13 vectors, 208 baseline adapter calls, 1,472 truncated prefixes,
noncanonical/lossy/context/version rejection, independent owned bytes and V6
authorizing-data identity. Retained network cases run in the same WASM instance.
The full Node consumer passes 196 network cases, network admissions, 23 additional
pre-initialization transaction admissions and six shared backing-store controls
(ordinary/spoofed initialization, network and transaction inputs).

Reproduce using new output paths:

```sh
node qualification/private-bindings-consumer/verify.test.mjs /home/jack/zakura-transaction-bindings-scratch/packet-1 /home/jack/zakura-transaction-bindings-scratch
node qualification/private-bindings-consumer/prepare.mjs /home/jack/zakura-transaction-bindings-scratch/packet-1 /home/jack/zakura-transaction-bindings-scratch/consumer-repro
node /home/jack/zakura-transaction-bindings-scratch/consumer-repro/node.mjs /home/jack/zakura-transaction-bindings-scratch/consumer-repro
```

The committed-source consumer package is
`/home/jack/zakura-transaction-bindings-scratch/consumer-final`, inventory SHA256
`607b03acf80c1219160aec0690b1045bf72db3e739496390ecf634ce993c41f3`;
runner SHA256 `f958cd5ce4d43443537e935732d8effd90a1a7b8c1f0c79a3fe9cd8dd9134dd3`.
Actual execution was attempted and failed at `listen EPERM` before launching the
installed packaged Firefox/geckodriver. Browser is pending; no confinement changes.
The runner retains the ordinary page module, deadlines and cleanup. Its only
changes are assigned log/scratch locations and the transaction result assertion.

```sh
node /home/jack/zakura-transaction-bindings-scratch/consumer-final/firefox.mjs 607b03acf80c1219160aec0690b1045bf72db3e739496390ecf634ce993c41f3
```

Detailed evidence and the exact parent handoff live in
`/home/jack/zakura-transaction-bindings-logs/{REPORT.md,CLIresult.md,checkpoint.md}`.
No whole #3/#4/#6 acceptance, public transaction factory, consensus/proof validation,
chain access, funds, publication or deployment is claimed.
