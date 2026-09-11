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
is the reference. `inline_scan` uses public scan_block and unchanged put_blocks.
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

Foundation native coverage: seven tests pass, including both shielded receipt/spend/
change paths, 1,025 irrelevant Sapling commitments, empty retained boundary,
roots/change witnesses, full-row failure atomicity, rewind/replay, UFVK import,
four batches (including an Ironwood-only receipt), public request equality, and separate transparent receipt/parsed
V6 spend with idempotent replay. Compact fixtures do not discover transparent data.

Cross-wallet SQL comparisons normalize only the random account UUID and row order.
Rollback compares all raw rows. Rewind can materialize tree caps/reference marks;
its final complete state must match the native cached rewind, while roots/witnesses,
checkpoints and all other rows must recover their original values. Raw first-run
canonical data and the diagnosed rewind diff are preserved in external logs.

WASM integration uses the same lock with `--no-default-features --features wasm-replay`.
`build-wasm.py` reads the hashed F1 C adapter/host from the generator's immutable
snapshot, never edits that worktree, and emits real wasm-bindgen 0.2.128 web glue
under scanner scratch. `replay/node.mjs` and `replay/browser.html` provide dedicated
unshared workers with external 60-second deadlines. Browser is a no-SAB probe;
serve the generated scratch bundle on loopback without isolation headers when
browser execution is available. This does not provide OPFS or Node durability.

See [EXTENSION.md](EXTENSION.md) for the six-case native/WASM interface, fresh
bundle commands, Firefox lifecycle runner, and remaining limits. [REPORT.md](REPORT.md)
preserves the historical foundation results. Actual coordinator Firefox no-SAB
and Node first replay both passed; the prior Chrome failure is not a browser blocker.
Exact extension execution receipts are in the external scanner logs.
