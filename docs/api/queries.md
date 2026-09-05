# Balances, history, transactions and inventory

::: tip Proposed Contract
Wallet queries describe local knowledge and include scan state. They must preserve nulls and unknown classifications instead of manufacturing complete balances or eligibility.
:::

<<< ./examples/queries.ts

## Balances

`getBalance({ accountId })` returns `amounts: null` when a summary is unavailable, distinct from zero in a known empty pool. Transparent regular and coinbase buckets remain separate; Sapling and Ironwood have separate buckets. Each preserves total, spendable, locked, pending change, pending spendability and uneconomic amounts.

`total` is economic value; `observedTotal` adds the backend uneconomic bucket in Rust. `unsupportedLegacy` exposes historical Orchard amounts explicitly, including them where the backend totals do. Those funds cannot enter v1 selection or migration. Never relabel them Ironwood or subtract reservations a second time. Do not infer an all-pool spendable amount from a shielded-only backend helper.

## History and detail

`getHistory` is account-relative. Delta sign alone does not establish direction; fee is nullable and transaction-wide, so summing it across account rows double-counts. Shielding and pool-crossing classification may be unknown. `historyComplete` remains the literal `'unknown'`, even after sync.

`getTransaction({ txid })` is wallet-wide: null means no local record; `raw: null` means a known record awaiting enhancement. Outputs are deduplicated by pool/index while retaining sending/receiving account relationships. Values and addresses may be unknown. Memos distinguish unknown, empty, text and binary. Change classification may be recorded, heuristic or unknown. SQL expiry classification is not confirmed unmined evidence.

## Notes and UTXOs

`listNotes` identifies shielded notes by txid/pool/output index; `listUtxos` identifies transparent outpoints. Omitted filters include spent, pending, locked, uneconomic and unknown records. `lockKnown` distinguishes an unknown lock from no lock. `eligibility` stays `'unknown'` until a complete Rust classifier is qualified; inventory is not an input-selection API. Legacy rows omitted from supported inventory are flagged explicitly.

## Pagination

Pages default to 50 items and accept at most 200. Use `nextCursor` until null, preserving the same account and filters. Relevant mutation raises `CURSOR_STALE`; refresh from the first page instead of merging incompatible revisions. Cursors bind database/epoch/revision and ordering. No total count or long-lived SQLite transaction is promised.

Unknown account queries error `ACCOUNT_NOT_FOUND`, except `accounts.get` returns null. Unavailable transport/methods error, not empty results. Query, confirmation and coinbase maturity policies are not interchangeable.
