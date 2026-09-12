# Wallet session error/completion review

Reviewed on 2026-09-12 by the standalone takeover assistant, independently of
the original implementation. Candidate: `b90e5fda333664b70cdfae29ae26489d55d416ba`,
base: `0e207014ace442dfa5e7643eb1e512f009d7cb30`.

Disposition: accepted for the documented internal, synchronous VIEW owner.
No blocking findings in the four-file change. This does not accept a public
wallet factory, loader, error transport, balance API, or restart recovery.

The review traced every session caller, the native VIEW adapter, FIFO draining,
close admission, and error construction. Local validation/closed errors have
SDK identity and a pre-dispatch `none` receipt. Failed metadata inspection
preserves the original exception. Native calls are synchronous; the catch does
not establish receipt handling for asynchronous replacement owners. Repeated
exception identity retains its first receipt, as documented; consumers must
not interpret it as a per-operation ledger. No rejected write is replayed.

Fresh verification in `zcash-worktrees/codex-takeover`:

- TypeScript compilation passed; all six `session.test.mjs` tests passed.
- `WALLET_TEST_ROOT=/tmp node tests/wallet/session-node.mjs
  /home/jack/zakura-account-compose-scratch/fixes/r1/mnemonic-build-04/bundle`
  exited 0. Three accounts/eight addresses survived close, two observed worker
  destructions, and reopen at `/tmp/views-node-dksXU5`.
- The initial Node invocation omitted `WALLET_TEST_ROOT` and exited 1 with
  `ENOENT` for `undefined/views-node-XXXXXX`; this was a command error, not a
  passing run or a product failure.
- Candidate diff whitespace validation passed.

The inherited Firefox report is
`/home/jack/zcash-sdk-wallet-compose-logs/errors-1216-host/firefox-result-1789231009474.json`.
It records Firefox 155, `pass: true`, persisted account identity/eight addresses,
precommit/committed cancellation assertions, and four created/destroyed worker
realms. Its runner and browser assertions were read. This review adopts that
record; it does not invent the missing historical process exit or claim a fresh
Firefox run. Quota exhaustion and browser eviction were not established.

Freshly compiled source was byte-compared to its retained browser staging:

| File | SHA-256 |
| --- | --- |
| `dist/src/wallet/session.js` | `ccfd08e1ab57309b44dc608c5374ce55d06108e61b5e78f3ed369e86bac652fb` |
| `dist/src/errors.js` | `f5f5930b7a5646bbf98e468ec7c89a73b3baa603543dcc9ddbe308d57bbb77c1` |
| `tests/wallet/views-worker.mjs` | `3bbdbe708c8b80c493fe1b03d98c1bceccf10bd779cf45fb793b13fdbe3a03dd` |
| `tests/wallet/session-browser.mjs` | `afdffcdde315633d2dddfb766fee1f627fd77a6fd7556e5e6833b673869e6cca` |

All 54 files in staging's `accepted` directory also matched the original
`mnemonic-build-04/bundle` byte-for-byte. This establishes current retained-file
equality, not a reconstructed contemporaneous HTTP response capture.

GitHub reads confirmed that SDK and bindings remote main remain at `0e207014`
and `a9b316b5`. Current issues 2–9 were read; none is completed by this review.
Hermes was not restarted, historical worktrees were preserved, and no loader
R2 acceptance was inferred from this independently scoped session review.
