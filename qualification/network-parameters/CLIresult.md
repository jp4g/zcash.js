# CLI result — bounded network parameters

Implemented internal canonical `zcash-js-network/1` parsing, owned bytes and
bindings to every NetworkDefinition field, plus an immutable native/WASM
Parameters adapter pinned to protocol 0.10.6. Proposed G4 spec is documented.
No public factory/exports, Common graph changes, SQLite dependency or weakened
light-genesis requirement. No push/merge/subagents/publication/live providers.

Actual checks:
- `bash qualification/network-parameters/check.sh`: exit 0; 48 JS tests, 2 Rust
  tests; 196 native and 196 Node-WASM parity cases (167 valid, 29 negative).
- API examples TypeScript: exit 0.
- Full VitePress docs build in owned scratch using copied installed dependencies:
  exit 0, including dead-link validation.
- `git diff --check`: exit 0.
- Actual sandbox Firefox runner: exit 1, socket listen EPERM before launch.

**Remaining:** parent executes frozen package-2 Firefox command in REPORT.md or
`/home/jack/zcash-network-parameters-logs/checkpoint.md`, records actual result in
coordinator-host-result.md; independent HIGH review after frozen source head.
No browser success or complete G4/factory acceptance is claimed.

Implementation head: 7bbd89e. Frozen package-2 SHA256SUMS digest:
`c57e41474813f87d96323d8c0a8fa73693f46e959a4f7375dbac37f18f65fa29`.
Detailed provenance, commands, failures and artifact hashes: REPORT.md.
