# F2 synthetic scanner foundation

Disposable issue #2 qualification, independent of F1. No SDK, production gate,
consensus-valid blocks, proof validation, or durability claim. Browser and Node
baseline/shared replay remain required for overall F2.

The pinned local wallet source is a9142ee100b3a563b7d9ba7a8e94201d00ad8154.
Common dependencies remain exactly 1.0.0; the consumer graph is the starting lock.
Only this directory is owned by this worker.

`fixture.rs` uses public Sapling and Ironwood V3 note constructors and encryption,
with synthetic deterministic inputs. Wallet setup uses real in-memory SQLite,
array module loading, WalletMigrator and account creation. The cached scanner
is the reference. `inline_scan` will use public scan_block and unchanged put_blocks.
The source TestBuilder probe could not resolve uncached ambassador; the authorized
fetch failed DNS. That probe and full logs are preserved outside the repository.

Commands run through `python3 qualification/scanner/run.py LABEL SECONDS COMMAND...`
from the repository root. The wrapper runs COMMAND in this directory, uses its own
Cargo cache/target/TMPDIR, jobs 2, and kills the process group at the finite deadline.
It records command, source/fixture hashes, output hash and exit status under
`/home/jack/zcash-scanner-logs`. Start offline. `SCANNER_FREEZE=1` explicitly updates
fixture/canonical files; ordinary tests must compare frozen files without rewriting.

Synthetic seeds, keys, protobuf blocks and raw transaction fixtures here have no
real-chain identity or funds. They are intentionally public test material.
