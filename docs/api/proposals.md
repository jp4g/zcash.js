# Reviewed immutable proposals

::: tip Proposed Contract
`propose` chooses a reviewable plan; it does not sign or broadcast. `send({ proposal })` executes exactly that retained plan and rejects stale state instead of replanning.
:::

<<< ./examples/proposals.ts

## What the reviewer approves

Show all steps and dependencies, selected inputs and their pools, recipients/amounts/memos, change and step-funding outputs, each fee and total fee. Recipient addresses remain exact. Change and step-funding addresses may be `null`
until native construction chooses them; show these as unresolved wallet-owned
outputs, not placeholder addresses. Their pool, amount and ownership intent remain
part of the plan. Review network, target height/branch, transaction versions,
expiry and lock expiry. Explain transparent disclosure and pool crossing before approval.

`operationId` is durable work identity, `proposalId` identifies the retained plan, and `reviewCommitment` binds review effects. The proposal commitment binds explicit recipient intent and internal-output
constraints; it does not claim to commit an unresolved address string. Native
execution must verify that change is wallet-controlled and step-funding is consumed
by the intended dependency. Wallet control does not bypass confirmation or maturity
rules. `revision` supports freshness checks. Account IDs are metadata, not proof of native getter availability. The application review callback in the example is application UX, not an SDK `approve` method or a transferable approval token.

The proposal is opaque and instance-bound. Readonly JavaScript fields alone do not make a `Uint8Array` immutable: Rust must retain/copy and revalidate canonical effects. Editing displayed output, fee, memo, network or selected inputs cannot change the retained approved plan.

## Staleness and locks

Revalidate after long review/proving, reorg, expiry and wallet mutation. `STALE_PROPOSAL`, `INPUT_LOCKED` or `REVIEW_MISMATCH` must not trigger an automatic new proposal. A new plan needs new review, and unresolved earlier spend evidence still needs reconciliation.

Locks are advisory wallet reservations, not consensus locks. Timeout/abort does not release them or invalidate a submitted transaction. Unknown chain tip cannot justify expiring another operation's lock.

For reviewed shielding, `propose({ kind: 'shield', accountId, ... })` creates a proposal consumed by `send({ proposal })`; `shield` itself has no proposal overload.
