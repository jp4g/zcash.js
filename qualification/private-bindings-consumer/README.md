# Private network binding consumption qualification

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
node qualification/private-bindings-consumer/verify.test.mjs /home/jack/zakura-bindings-network-scratch/fix-r1-packet-normal /home/jack/zakura-bindings-network-scratch
node qualification/private-bindings-consumer/prepare.mjs /home/jack/zakura-bindings-network-scratch/fix-r1-packet-normal /home/jack/zakura-bindings-network-scratch/fix-r1-browser
node /home/jack/zakura-bindings-network-scratch/fix-r1-browser/node.mjs /home/jack/zakura-bindings-network-scratch/fix-r1-browser
```

The local verifier checks the independently pinned metadata digest, revision,
actual Git commit/tree/lock and all five fixed files' exact hashes/lengths, with
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
import or security override is used. Parent owns actual browser/socket execution.

The committed pin selects private revision
`2de5fc0a0b1eed6927251157d6bfc3181515fdf9` and build metadata SHA-256
`bcac33310a80a516da6ba22c06b5a29b581f6c086830ad19c3d37df387a498f9`.
Two fresh committed-source builds (normal Python and `-O`) match byte-for-byte.
This pin contains the R1 build-guard fix only. HIGH review R2 (SharedArrayBuffer
prototype-spoof admission) remains unresolved; this is not a merge-ready packet. The actual pinned Node
consumer passes 196 cases plus 29 admission controls; all nine pin/file rejection
controls pass. The final browser package is
`/home/jack/zakura-bindings-network-scratch/fix-r1-browser`, with inventory digest
`3a0a8c730ff9f2acc51241ab646a14cbd6d35b397b143391968a093c620b0f25`.
Parent owns actual Firefox execution and independent review. Historical uncommitted
candidate packages are preserved and are not the final pinned package. Detailed
results and the exact browser command are under
`/home/jack/zakura-bindings-network-logs/fixes/{checkpoint.md,REPORT.md,CLIresult.md,BROWSER-COMMAND.txt}`.

No complete runtime profile, executable host loader, worker/ABI negotiation,
network registration, public defineNetwork or client genesis verification is
claimed. Wallet/storage/signing/proving/outbox remain separate gates.
