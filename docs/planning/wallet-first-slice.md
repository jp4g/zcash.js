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

Local fullScan validation uses the existing SDK `INVALID_ARGUMENT` error
(`validation` / `correct-input`), including when descriptor inspection throws.
Admission after close starts uses `CLOSED` (`runtime` / `none`). Both have fixed
SDK messages and a `none` receipt on the exact rejected error because the owner
was not called. The local check does not invoke birthday accessors or inspect
foreign exception payloads.

Native exceptions remain internal. `completion(error)` retains `none`,
`committed`, or `unknown` against that exception's identity. The worker fixture
consumes this receipt before returning a serializable reply. A committed abort
returns no successful result; subsequent native list/get reconciles persisted
state without repeating the write. This is not public pending-operation recovery
or public ZcashError mapping. Descriptor inspection failure records `unknown`
without replacing the original native exception; only exact own data values
`none` and `committed` are recognized. No message, stack, cause, prototype or
string conversion is used by the session. The first receipt for an object
identity is retained, even if later metadata changes. Reusing an exception for
multiple operations is ambiguous: this identity receipt cannot describe each
operation separately. There is no new per-operation receipt policy.

Primitive native rejections remain unchanged without receipts. The accepted
owner calls synchronously; asynchronous replacement owners are not qualified.
Close failures remain original in the cached close promise, with no new write
receipt or rollback inference (an existing identity receipt remains intact).
The fixture serializes native error properties and is not a sanitized public
rejection boundary; hostile-input coverage is synthetic session-only evidence.

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
compiled SDK at their repository-relative paths, including
`/dist/src/errors.js`, now imported by `/dist/src/wallet/session.js`. A fixed
browser asset map must include that runtime dependency. This slice adds no server or
browser runner. Coordinator1398279 owns eligibility, Firefox execution,
independent HIGH review, and integration; browser source syntax checks alone are
not Firefox acceptance.

No WalletClient factory/export, Network, MemorySigner, public birthday
projection, public error/recovery integration, balance, or loader acceptance is
claimed. Public package workflow acceptance remains pending.
