# Design principles

::: tip Proposed Contract
Keep ordinary journeys short while preserving explicit authority, exact values and recoverable state.
:::

## Three independent responsibilities

Public and light clients own endpoint interaction; neither opens a wallet. The wallet owns local account/history state through Rust/WASM. `createZcashClient({ public, light, wallet })` checks matching networks and returns references to those same instances, without new state or disposal ownership.

Methods use named arguments and at most one resource namespace: `accounts`, `addresses`, `pczt`, `operations`. Ordinary queries, `sync`, `send` and `shield` stay flat. There is no per-account service object or hidden active account.

## Authority is explicit

An account ID identifies a database record. It is neither a ZIP32 derivation index nor an address nor proof of a signing key. Viewing, spending-state tracking, signing and proving are separate. A UFVK may allow complete tracking without supplying spending authority. Signer attachment must verify actual key correspondence.

## Rust owns wallet rules

Rust validates encodings, derives keys, selects inputs, calculates fees/change, verifies authorization, constructs/proves transactions, scans and projects SQLite state. TypeScript schedules work, transports bytes and invokes application callbacks. It must not reconstruct spendability or cryptographic rules from convenient query fields.

## Evidence travels with results

Endpoint observations carry source and time. Wallet queries carry scan state and revision. Unknown is represented as unknown or null, not zero. A submission acknowledgment is not inclusion; a successful wait is historical chain evidence, not irreversible finality.

## Review survives execution

A proposal fixes effects, policy context and selected inputs. Execution may reject stale state but cannot silently revise an approved payment. An ambiguous submission is reconciled and retried using exact stored bytes. Local mutation and dispatch have separate commit boundaries.

See [decisions](../planning/decision-log.md) for owner constraints and [host mapping](host-mapping.md) for backend ownership.
