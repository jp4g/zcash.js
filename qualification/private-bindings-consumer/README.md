# Private network binding consumption qualification

Only this subtree belongs to this workstream. Public SDK exports, clients, the
accepted network-parameters qualification crate and other workers are unchanged.
The production Rust crate and generated output ownership are in the private
`/home/jack/zakura-wasm-bindings` repository, related to zcash.js #4.

`pin.json` is created only after a real committed-source private build. It records
that exact local repository, full revision and `build.json` SHA-256. No placeholder
pin is supplied when the producing commit is blocked. `pin.mjs` is an explicit
one-time local pin update (`wx` prevents silently replacing an existing pin).

After the private source commit and successful explicit `build.py` invocation:

```sh
node qualification/private-bindings-consumer/pin.mjs /home/jack/zakura-bindings-network-scratch/packet-1
node qualification/private-bindings-consumer/verify.test.mjs /home/jack/zakura-bindings-network-scratch/packet-1 /home/jack/zakura-bindings-network-scratch
node qualification/private-bindings-consumer/prepare.mjs /home/jack/zakura-bindings-network-scratch/packet-1 /home/jack/zakura-bindings-network-scratch/browser-pinned-1
node /home/jack/zakura-bindings-network-scratch/browser-pinned-1/node.mjs /home/jack/zakura-bindings-network-scratch/browser-pinned-1
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
`33345a982d330650935c39f505c9fa2947ec9897` and build metadata SHA-256
`5c3f7b2afde98d205c3a6a2d35533aa172115c5293144ee180ba42084c41b5d2`.
Two fresh committed-source builds match byte-for-byte. The actual pinned Node
consumer passes 196 cases plus 29 admission controls; all nine pin/file rejection
controls pass. The final browser package is
`/home/jack/zakura-bindings-network-scratch/browser-pinned-1`, with inventory digest
`c208432bd703ff0b5e55dfd82274b42f37393cb80ffbb7223401210cc4b567a8`.
Parent owns actual Firefox execution and independent review. Historical uncommitted
candidate packages are preserved and are not the final pinned package. Detailed
results and the exact browser command are under
`/home/jack/zakura-bindings-network-logs/{checkpoint.md,REPORT.md,CLIresult.md,BROWSER-PINNED-COMMAND.txt}`.

No complete runtime profile, executable host loader, worker/ABI negotiation,
network registration, public defineNetwork or client genesis verification is
claimed. Wallet/storage/signing/proving/outbox remain separate gates.
