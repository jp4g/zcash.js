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

The current candidate browser package is marked as uncommitted-source development
evidence. It cannot stand in for the final revision-pinned package. See the external
`/home/jack/zakura-bindings-network-logs/{checkpoint.md,REPORT.md,CLIresult.md}` and
`finish-after-private-commit.sh` for current results and exact remaining commands.

No complete runtime profile, executable host loader, worker/ABI negotiation,
network registration, public defineNetwork or client genesis verification is
claimed. Wallet/storage/signing/proving/outbox remain separate gates.
