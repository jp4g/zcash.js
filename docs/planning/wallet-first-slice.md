# Internal first wallet session

`src/wallet/session.ts` consumes the accepted, already initialized VIEW owner in
that owner's dedicated worker. `WalletSession` serializes invocation and
completion, drains admitted calls before closing once, and rejects admission
after close starts. The enclosing host destroys the worker even if close fails.
The internal caller keeps request objects unchanged until completion.

The account import method admits UFVK `birthday: 'fullScan'` only. Account
list/get and address current/next/list/at use the frozen API DTO types. Native
validation, address derivation, storage, and bigint conversion stay in the
accepted owner. There is no account cache, signer, or write replay.

Native exceptions remain internal. `completion(error)` retains `none`,
`committed`, or `unknown` against that exception's identity. The worker fixture
consumes this receipt before returning a serializable reply. A committed abort
returns no successful result; subsequent native list/get reconciles persisted
state without repeating the write. This is not public pending-operation recovery
or public ZcashError mapping.

## Verified Node subset

The tests adapt the accepted Node/browser VIEW fixtures and share the exact
accepted `mnemonic-build-04/bundle` closure, including its original synthetic
`views-fixture.json` and `wallet-support.mjs`. No producer is run.

The real FS worker test covers fullScan default and explicit viewOnly policy,
account list/get/null, default current address, explicit transparent next,
88-bit exact shielded unified address, address list, precommit and committed
import/address cancellation, injected write/commit failure, idempotent close,
observed worker destruction, and reopening the same database with stable UUIDs
and addresses. The scheduling unit checks cover queue order, rejection drain,
close admission/failure, and the fullScan-only dispatch boundary.

A fresh fullScan database has no chain height. Native default unified `next`
returns `SYNC_REQUIRED`; the test asserts this unchanged behavior. Explicit
transparent `next` and exact shielded unified `at` succeed. The session performs
no fallback and invents no sync state. Transparent exposure can add both native
unified and transparent records, so cancellation reconciliation counts actual
transparent exposures rather than assuming one address-list row per call.

With existing TypeScript available, compile using `tsc -p tsconfig.json`, then:

```sh
node tests/wallet/session.test.mjs
WALLET_TEST_ROOT=/assigned/scratch node tests/wallet/session-node.mjs /accepted/mnemonic-build-04/bundle
```

## Pending acceptance

`tests/wallet/session-browser.mjs` adapts the existing VIEW browser lifecycle
fixture and shares `views-worker.mjs`. It requires the original lifecycle
observer and a `bundle` page query parameter resolving to the accepted closure
directory (with trailing slash). The host must serve the owned test files and
compiled SDK at their repository-relative paths. This slice adds no server or
browser runner. Coordinator1313400 owns eligibility, Firefox execution,
independent HIGH review, and integration; browser source syntax checks alone are
not Firefox acceptance.

No WalletClient factory/export, Network, MemorySigner, public birthday
projection, public error/recovery integration, balance, or loader acceptance is
claimed. Public package workflow acceptance remains pending.
