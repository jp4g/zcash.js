# Preflight command record

Working directory for every command:
`/home/jack/zcash-worktrees/node-runtime`.
This is a manually retained command/exit summary; external logs could not be
created. No build/test commands ran. Read-only document discovery/read commands
are not qualification gates.

| Exact command | Exit | Observation |
| --- | --- | --- |
| `git status --short` | 0 | Empty output before changes. |
| `git branch --show-current` | 0 | `test/issue-2-node-runtime` |
| `git rev-parse HEAD` | 0 | `e270ac0e46fabfe2f081ee8db8ff31ed536fdc76` |
| `ls -ld /home/jack/zcash-node-runtime-logs /home/jack/zcash-node-runtime-scratch` | 2 | Both paths absent. |
| `mkdir -p /home/jack/zcash-node-runtime-logs /home/jack/zcash-node-runtime-scratch` | 1 | Two `mkdir: Read-only file system` diagnostics. |
| `sha256sum qualification/consumer/Cargo.lock` | 0 | Lock hash in report. |
| `rustc -Vv` | 0 | Compiler identity in report. |
| `cargo -V` | 0 | Cargo identity in report. |
| `node --version` | 0 | `v26.8.1`; no wasm execution. |
| `sed -n '1963,1975p' qualification/consumer/Cargo.lock` | 0 | wasm-bindgen `0.2.128`. |
| `/home/jack/zcash-qualification-scratch/wasi-sdk-27.0-x86_64-linux/bin/clang --version` | 0 | Clang identity in report. |

The inventory commands ran in shell batches; individual successful statuses
above follow successful output, while the recorded tool exit is the batch's
last command status. Directory creation was an independent command with a
directly observed exit 1. There is no fabricated per-command log hash.
