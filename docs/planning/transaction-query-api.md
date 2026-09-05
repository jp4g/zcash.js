# Transaction and query API plan

Authoritative integration, 2026-09-04; documentation only. [Decisions D04–D25](decision-log.md), the [approved namespace tree](api-namespace-audit.md), and [keys/account contract](keys-accounts-signers-api.md) govern scope. Signatures and new host names remain planning candidates, not implemented exports. This plan supersedes conflicting transaction/query sketches in research and scratch reports. It does not claim runtime validation.

## Evidence and reconciliation

This plan integrates three local scratch audits completed during planning: transaction automation, wallet query/sync, and WASM host architecture. The scratch files are not repository dependencies or durable links. Durable source coordinates follow; the [capability map](../research/zakura-api-capability-map.md) retains pool/feature detail.

| Key | Pinned source and exact symbol families |
| --- | --- |
| B | Wallet libraries `a9142ee100b3a563b7d9ba7a8e94201d00ad8154`, crate `zcash_client_backend`: [data_api.rs](https://github.com/zakura-core/wallet-libraries/blob/a9142ee100b3a563b7d9ba7a8e94201d00ad8154/librustzcash/zcash_client_backend/src/data_api.rs): `WalletRead` at 2123, `WalletTest` at 2589, `WalletWrite` at 3621, `Balance` at 221, `AccountBalance` at 353, `TransactionDataRequest` at 1388, `TransactionStatus` at 1500. |
| T | B [data_api/wallet.rs](https://github.com/zakura-core/wallet-libraries/blob/a9142ee100b3a563b7d9ba7a8e94201d00ad8154/librustzcash/zcash_client_backend/src/data_api/wallet.rs): `propose_transfer` 778, `propose_shielding` 1215, `create_proposed_transactions` 1429, `create_pczt_from_proposal` 2850, `redact_pczt_for_signer` 3310, `extract_and_store_transaction_from_pczt` 3481. |
| S | Crate `zcash_client_sqlite`: [lib.rs](https://github.com/zakura-core/wallet-libraries/blob/a9142ee100b3a563b7d9ba7a8e94201d00ad8154/librustzcash/zcash_client_sqlite/src/lib.rs) `ExtensionTransaction` 310, `WalletDb::from_connection` 533, `transactionally_with_extension` 609; [wallet/init.rs](https://github.com/zakura-core/wallet-libraries/blob/a9142ee100b3a563b7d9ba7a8e94201d00ad8154/librustzcash/zcash_client_sqlite/src/wallet/init.rs) `WalletMigrator::with_external_migrations` 540. |
| Q | S [wallet/db.rs](https://github.com/zakura-core/wallet-libraries/blob/a9142ee100b3a563b7d9ba7a8e94201d00ad8154/librustzcash/zcash_client_sqlite/src/wallet/db.rs) `VIEW_TRANSACTIONS` 1383, `VIEW_TX_OUTPUTS` 1609; [wallet.rs](https://github.com/zakura-core/wallet-libraries/blob/a9142ee100b3a563b7d9ba7a8e94201d00ad8154/librustzcash/zcash_client_sqlite/src/wallet.rs) summary 2526, received outputs 5765; [wallet/transparent.rs](https://github.com/zakura-core/wallet-libraries/blob/a9142ee100b3a563b7d9ba7a8e94201d00ad8154/librustzcash/zcash_client_sqlite/src/wallet/transparent.rs) `add_transparent_account_balances` 1832. These SQL internals are evidence, not public exports. |
| P | Crate `pczt`: [src](https://github.com/zakura-core/wallet-libraries/tree/a9142ee100b3a563b7d9ba7a8e94201d00ad8154/librustzcash/pczt/src), `Pczt::{parse,serialize}`, `roles::{prover::Prover,signer::Signer,combiner::Combiner,redactor::Redactor,spend_finalizer::SpendFinalizer,tx_extractor::TransactionExtractor}`. |
| N | B [service.proto](https://github.com/zakura-core/wallet-libraries/blob/a9142ee100b3a563b7d9ba7a8e94201d00ad8154/librustzcash/zcash_client_backend/lightwallet-protocol/walletrpc/service.proto), `CompactTxStreamer` and `RawTransaction`; [sync.rs](https://github.com/zakura-core/wallet-libraries/blob/a9142ee100b3a563b7d9ba7a8e94201d00ad8154/librustzcash/zcash_client_backend/src/sync.rs), `sync::run`; [chain.rs](https://github.com/zakura-core/wallet-libraries/blob/a9142ee100b3a563b7d9ba7a8e94201d00ad8154/librustzcash/zcash_client_backend/src/data_api/chain.rs), `scan_cached_blocks`. |
| C | Separate Common `13360888be437f066da5e16242663d1b211c6f87`, 1.1.0: [transaction/mod.rs](https://github.com/zakura-core/common/blob/13360888be437f066da5e16242663d1b211c6f87/crates/zcash_primitives/src/transaction/mod.rs), `Transaction::{read,write,txid}`. This establishes the operation family only; the exact serialization binding remains provisional until rechecked against the selected coherent locked Common **1.0.0** graph. |

Reconciliations: `accountId` is explicit, including send/shield/history. Zakura's native `Proposal` does not contain account IDs, so the zcash.js immutable proposal envelope and operation journal must carry, persist, restore, and revalidate its explicit account set. Optional authority means a supplied signer or a verified attached signer, never a hidden account. Public accounts use `viewOnly`, never backend `AccountPurpose`. `Pool` is only transparent/Sapling/Ironwood. No generic `Snapshot<T>` or caller capability matrix is required. The transaction report incorrectly calls `get_sent_outputs` a production `WalletRead` method: the inspected declaration is on test-gated `WalletTest`; use a Rust projection instead.

## Ordinary and advanced calls

Assume an opened wallet with explicitly selected `accountId`, configured transport/proof assets and a matching attached signer. These are alternative payment examples, not successive steps for the same payment.

```ts
const pending = await wallet.send({ accountId, to: recipient, amount: 125_000n });
await pending.wait({ confirmations: 3 });

// Alternatively supply authority for this call; attachment is optional.
const payment = await wallet.send({ accountId, to: recipient, amount: 125_000n, signer });
await payment.wait();

const shielding = await wallet.shield({ accountId });
await shielding.wait();
```

`send` automates Zakura proposal/input selection/fees/change/proving/local authorization/serialization/wallet storage, then host broadcast. It returns `PendingPayment` after durable creation and the initial ordered submission pass, including acknowledged/rejected/unknown outcomes; it does not wait for mining. Prior failures carry an operation ID if allocated. Failed persistence prevents dispatch; failed response persistence leaves the pre-dispatch attempt unknown. A reused synchronized wallet needs no compulsory `sync`, fee-estimate, select, reserve, prepare or simulation call. Configured bounded freshness policy may catch up before proposing; missing prerequisites produce `SYNC_REQUIRED`. No wallet algorithms move into JS.

The wrapper must pass an explicit Zakura `SpendPolicy` rather than its default: permit only `ShieldedPool::{Sapling, Ironwood}`, adding the intended `TransparentSpendPolicy` when transparent inputs are allowed. The Zakura default also permits legacy Orchard when compiled, which would violate v1 scope. The exact transparent policy remains explicit because spending transparent funds can link addresses and coinbase funds have separate constraints.

```ts
const proposal = await wallet.propose({
  accountId,
  payments: [{ to: recipient, amount: 125_000n, memo: { text: 'Invoice 42' } }],
  maxFee: 100_000n,
  idempotencyKey: 'invoice-42',
});
await applicationReview(proposal); // application UI; effects are immutable
const pending = await wallet.send({ proposal, signer });
await pending.wait();
```

`send({ proposal })` executes exactly that approved plan; it never proposes again. Freeze recipients, amounts, memos, inputs, change, fee, account/network, branch/version, expiry policy and step dependencies. Revalidate stale plans and require fresh review for changes. `maxFee` is a rejection bound, not an override. Expiry is a host-bound resolved rule/value because Rust `Proposal` has no expiry getter; validate the constructed transaction against it. Lock expiry, transaction expiry and wait timeout are distinct.

Local `create_proposed_transactions` is fused and returns nonempty txids after building supported steps. Earlier steps can fund later ones through transparent outputs; this is not an arbitrary shielded dependency DAG. Do not split those steps in JS or promise independently resumable local build/prove/sign stages. It stores after all steps build, but earlier side effects require the enclosing transaction for rollback.

`shield({ accountId })` composes `propose_shielding`: eligible owned transparent funds into the selected account's supported shielded change destination. It is not an arbitrary recipient transfer or unconditional sweep. Report `NOTHING_TO_SHIELD` when appropriate. The distinct `propose_shielding_coinbase` path is not a silently substituted ordinary shield overload.

```ts
// Single-step external handoff; application adapter uses the approved signer seam.
const exchange = await wallet.pczt.export({ proposal: singleStepProposal });
const returnedBytes = await applicationExternalAuthorization(exchange.bytes);
const signed = await wallet.pczt.import({ operationId: exchange.operationId, bytes: returnedBytes });
const proved = await wallet.prove({ pczt: signed });
const ready = await wallet.finalize({ pczt: proved }); // verifies and stores; no network
await ready.broadcast();
await ready.wait();

// Alternative explicit PCZT staging, where these roles/materials permit this order.
const built = await wallet.build({ proposal: anotherSingleStepProposal });
const proven = await wallet.prove({ pczt: built });
const authorized = await wallet.sign({ pczt: proven, signer });
const staged = await wallet.finalize({ pczt: authorized });
await staged.broadcast();
```

`build/prove/sign/finalize` have **PCZT semantics**. Proposal-to-PCZT rejects multi-step plans before disclosure. Construction already finalizes I/O. Proof and authorization completeness are separate predicates; legal ordering depends on pool/version/material, not a universal stage enum. Retain the full wallet PCZT and redact only the signer copy. Import bounds/parses bytes, verifies association and approved effects, combines against the full artifact and persists a new artifact; parse/combine alone is not approval. Partial authorization is allowed on import; finalization requires all proofs/signatures and proprietary wallet metadata. Sapling proving authority is not a UFVK. Generic signing is in scope; concrete Ledger remains unsupported. Consequently, ordinary `send` with external authority must reject a generated multi-step proposal with a typed `PCZT_MULTI_STEP_UNSUPPORTED` result and retain its reviewable operation; it cannot promise the fused local multi-step behavior. The caller may revise the intent and approve a newly generated single-step proposal, but zcash.js must not silently change the original.

## Candidate transaction declarations

The types below reuse opaque account/network/txid/signer types from the keys plan. They specify the overload boundary without requiring a service graph at the call site. The zcash.js proposal envelope pins its explicit account identities, so execution need not repeat accountId; this association is wrapper metadata and must survive serialization/restoration because Zakura's native `Proposal` does not carry it.

```ts
type Payment = { to: string; amount: bigint; memo?: { text: string } | { bytes: Uint8Array } };
type SendIntent = { accountId: AccountId; idempotencyKey?: string; maxFee?: bigint } &
  (Payment | { payments: readonly [Payment, ...Payment[]] });
type ExecuteOptions = { signer?: Signer; signal?: AbortSignal };
type PcztArtifact = {
  operationId: string; artifactId: string;
  proofsComplete: boolean; authorizationComplete: boolean;
};
type PaymentState = {
  operationId: string; revision: string; accountIds: readonly AccountId[];
  durability: 'durable' | 'ephemeral';
  phase: 'proposed' | 'awaitingAuthorization' | 'building' | 'ready' | 'observing' | 'needsAttention' | 'complete';
  steps: readonly {
    index: number; dependsOn: readonly number[]; txid: TxId | null;
    attempts: readonly {
      attemptId: string; outcome: 'started' | 'acknowledged' | 'rejected' | 'unknown';
      sourceId: string; startedAt: string; completedAt: string | null;
    }[];
    inclusion: null | { height: number; blockHash: string | null; confirmations: number | null };
    expiry: { height: number | null; reached: boolean | null; confirmedUnminedAt: number | null };
    blockedBy: readonly number[];
  }[];
};
interface PendingPayment {
  readonly operationId: string;
  snapshot(): Promise<PaymentState>;
  events(args?: { signal?: AbortSignal }): AsyncIterable<PaymentState>;
  broadcast(args?: { signal?: AbortSignal }): Promise<PaymentState>;
  wait(args?: { confirmations?: number; timeoutMs?: number; signal?: AbortSignal }):
    Promise<{ operationId: string; transactions: readonly {
      txid: TxId; height: number; blockHash: string; confirmations: number;
    }[]; snapshot: PaymentState }>;
}
interface TransactionActions {
  send(args: (SendIntent | { proposal: Proposal }) & ExecuteOptions): Promise<PendingPayment>;
  shield(args: { accountId: AccountId; fromAddresses?: readonly string[];
    toPool?: 'sapling' | 'ironwood'; threshold?: bigint } & ExecuteOptions): Promise<PendingPayment>;
  propose(args: SendIntent | { kind: 'shield'; accountId: AccountId }): Promise<Proposal>;
  build(args: { proposal: Proposal }): Promise<PcztArtifact>;
  prove(args: { pczt: PcztArtifact; signal?: AbortSignal }): Promise<PcztArtifact>;
  sign(args: { pczt: PcztArtifact } & ExecuteOptions): Promise<PcztArtifact>;
  finalize(args: { pczt: PcztArtifact }): Promise<PendingPayment>;
}
```

`phase` is journal presentation, not proof that PCZT roles form a linear pipeline. Null inclusion alone does not assert mempool presence; observers retain endpoint source/as-of and prior fork information. Expiry height zero means disabled, null means unknown. Reconciled completion may change after reorg. Public raw broadcast returns a plain `txid/sourceId/acknowledged|rejected|unknown` attempt report, never this wallet state or private account detail.

## Public tree and exact mapping

```text
PublicClient: getTip/getBlock/getBlockHeader/getTransaction/getTransactionStatus/
  getUtxos/getTreeState/getSubtreeRoots/broadcastTransaction/waitForTransaction/watchTransaction
LightClient: getTip/getServerInfo/getTransaction/getAddressUtxos/getAddressBalance/
  getTreeState/getSubtreeRoots/streamCompactBlocks/streamAddressTransactions/streamMempool/broadcastTransaction
WalletClient:
  accounts.{create,import,list,get,remove,attachSigner,detachSigner}
  addresses.{current,next,list,at}
  pczt.{export,import}       operations.{list,get,resume}
  send/shield/propose/build/prove/sign/finalize/broadcast
  getBalance/getHistory/getTransaction/listNotes/listUtxos/sync/watchSync/getSyncStatus/close
PendingPayment: snapshot/wait/events/broadcast
standalone pczt: parse/serialize/inspect/combine/redact
```

Direct means production Rust core exists; composed combines primitives; thin glue is new bounded binding/projection/transport work; missing means no complete product implementation. These labels belong in planning, not ordinary results. Account/address creation and custody details remain in the linked keys plan.

| Method | Classification and exact source mapping |
| --- | --- |
| accounts.create/import/remove | Direct B `WalletWrite::{create_account,import_account_hd,import_account_ufvk,delete_account}`; removal also coordinates unresolved work. UFVK `viewOnly?: boolean` defaults false (D22). |
| accounts.list/get | Composed `WalletRead::get_account_ids` + `get_account` / direct `get_account`; `Account` getters → DTO, thin session signer status. No implicit viewing export. |
| accounts.attachSigner/detachSigner | Thin host registry and verified key matching; no backend account upgrade. |
| addresses.current/next/list/at | Direct `WalletRead::get_last_generated_address_matching`, `WalletWrite::get_next_available_address`, `WalletRead::list_addresses`, `WalletWrite::get_address_for_index`. Next/at persist exposure. |
| send(intent), send({ proposal }), shield | Composed T `propose_transfer` (skip for supplied proposal) / `propose_shielding` with an explicit v1 `SpendPolicy` excluding legacy Orchard → `create_proposed_transactions(SpendingKeys, ...)` → B `WalletRead::get_transaction` → locked-graph `Transaction::write`, then new journal and host transport. External authority composes PCZT and rejects multi-step proposals. |
| propose | Direct T proposal functions; `proposal::{Proposal,Step}` getters plus thin immutable review/lock envelope. |
| build | Direct T `create_pczt_from_proposal`, with thin artifact ownership; PCZT only. |
| prove | Composed P `Prover::{new,requires_sapling_proofs,requires_ironwood_proof,create_sapling_proofs,create_ironwood_proof,finish}`. |
| sign | Composed P `Signer::{new,sign_transparent,sign_sapling,sign_ironwood,finish}`; external contributions via `append_transparent_signature`, `apply_sapling_signature`, `apply_ironwood_signature` or checked combination. |
| finalize | Direct T `extract_and_store_transaction_from_pczt`, internally `SpendFinalizer::finalize_spends` and `TransactionExtractor::extract`; new atomic outbox glue. |
| wallet.pczt.export/import | Composed T creation/redaction + P `Pczt::serialize`; P `Pczt::parse`, `Combiner::{new,combine}` plus missing approval/artifact journal. Export also accepts an existing associated PCZT. |
| standalone pczt.parse/serialize/inspect/combine/redact | Direct `Pczt::{parse,serialize}`; thin getter projection for inspect; direct/composed `Combiner` and `Redactor` field operations. No wallet association granted. |
| getBalance | Direct B `WalletRead::get_wallet_summary(policy)` → `WalletSummary::account_balances` → `AccountBalance::{unshielded_regular_balance,unshielded_coinbase_balance,sapling_balance,ironwood_balance,orchard_balance}` and `Balance` getters; thin scan/revision projection. |
| getHistory | Missing production history API; thin Rust schema-pinned Q `v_transactions` projection with pagination. Never `WalletTest::get_tx_history`. |
| getTransaction | Composed B `WalletRead::{get_transaction,get_tx_height,get_memo,get_received_outputs}` plus thin Q existence/account/output projection. Sent outputs come from views, never `WalletTest::get_sent_outputs`. |
| listNotes/listUtxos | Missing full inventory; thin Q received-note/transparent-output/spend projections. B `InputSource::{select_unspent_notes,select_spendable_notes,get_spendable_note,get_spendable_transparent_outputs_for_addresses}` provide selection subsets only, not complete lists. |
| getSyncStatus | Composed B `WalletRead::{chain_height,block_fully_scanned,block_max_scanned,get_wallet_birthday,get_wallet_recover_until,suggest_scan_ranges,get_wallet_summary,transaction_data_requests}` + missing runner/revision state. |
| sync/watchSync | Composed N `scan_cached_blocks`; B `WalletWrite::{update_chain_tip,truncate_to_height,truncate_to_chain_state,put_received_transparent_utxo,set_transaction_status,notify_address_checked,notify_output_verified_unspent}`, `WalletCommitmentTrees::put_*_subtree_roots`, T `decrypt_and_store_transaction`. Missing complete scheduler/stream; optional `sync::run` is incomplete. |
| operations.list/get/resume | Missing product journal over S extension transactions/migrations; resume only rehydrates artifacts/attaches behavior. |
| pending.snapshot/events/wait | Missing lifecycle + composed B tx-height/block-hash/status/request/scan/rewind primitives and endpoint observations. Snapshot is local; observers share coordination. |
| wallet.broadcast/pending.broadcast | Thin/composed immutable outbox read, append attempt and host transport; no build/sign. |
| close | Thin owner queue/handle/storage lifecycle; Rust connection close/disposal, no Zakura public client close API. |

| Flat transport method | Exact protocol mapping; host glue, no Zakura wallet algorithm |
| --- | --- |
| light.getTip/getServerInfo/getTransaction | N `CompactTxStreamer.GetLatestBlock/GetLightdInfo/GetTransaction(TxFilter)`; generated Rust client names `get_latest_block/get_lightd_info/get_transaction` where enabled. |
| light.getAddressUtxos/getAddressBalance | `GetAddressUtxos` or `GetAddressUtxosStream`; `GetTaddressBalance(AddressList)`. Transparent data only. |
| light.getTreeState/getSubtreeRoots | `GetTreeState/GetSubtreeRoots`; actual Ironwood deployment must qualify. |
| light.streamCompactBlocks/streamAddressTransactions/streamMempool | `GetBlockRange/GetTaddressTransactions/GetMempoolStream`; older `GetTaddressTxids` returns raw transactions; `GetMempoolTx` is a distinct compact stream. |
| light.broadcastTransaction | `SendTransaction(RawTransaction)` → `SendResponse`; derive txid from bytes. |
| public.getTip/getBlock/getBlockHeader | Candidate JSON-RPC `getblockchaininfo` or consistent `getblockcount` + `getbestblockhash`; `getblock/getblockheader`. |
| public.getTransaction/getTransactionStatus | Candidate `getrawtransaction` plus block/tip/mempool evidence; no universal status RPC. |
| public.getUtxos/getTreeState/getSubtreeRoots | Optional provider `getaddressutxos/z_gettreestate/z_getsubtreesbyindex`; indices/pools must qualify. |
| public.broadcastTransaction/waitForTransaction/watchTransaction | `sendrawtransaction`; composed transaction/block/tip observations for wait/watch. Block/range/mempool observation families remain unnamed until their protocol contract is specified. |

Public JSON-RPC candidates come from the [provider landscape](../research/provider-endpoint-landscape.md), not tested server promises. Public/light clients construct independently without wallet/keys/prover assets. Standard `http` and `grpc` hide permitted browser mechanics; no project infrastructure or silent endpoint failover.

## Ergonomic query results

```ts
type Pool = 'transparent' | 'sapling' | 'ironwood';
type ScanState = {
  revision: string; // opaque epoch + sequence, not height
  tipHeight: number | null;
  fullyScannedHeight: number | null;
  maxScannedHeight: number | null;
  scanComplete: boolean | null; // relative to known tip and configured birthday
};
type AccountRecord = {
  id: AccountId; name: string | null; birthdayHeight: number;
  accountIndex: number | null; viewOnly: boolean; signerAttached: boolean;
};
type BalanceBuckets = {
  total: bigint; spendable: bigint; locked: bigint;
  changePendingConfirmation: bigint; pendingSpendability: bigint; uneconomic: bigint;
};
type WalletBalance = {
  accountId: AccountId; scan: ScanState;
  amounts: null | {
    total: bigint; uneconomic: bigint; observedTotal: bigint;
    transparent: { regular: BalanceBuckets; coinbase: BalanceBuckets };
    sapling: BalanceBuckets; ironwood: BalanceBuckets;
    unsupportedLegacy: null | { kind: 'legacyOrchard'; balance: BalanceBuckets };
  };
};
type HistoryPage = {
  items: readonly HistoryEntry[]; nextCursor: string | null;
  scan: ScanState; historyComplete: 'unknown';
};
// All account-scoped queries require accountId; detail lookup is wallet-wide by txid.
const accounts = await wallet.accounts.list();
const balance = await wallet.getBalance({ accountId });
if (balance.amounts !== null) renderBalance(balance.amounts, balance.scan);
const history = await wallet.getHistory({ accountId, limit: 50 });
renderHistory(history.items, history.scan);
const detail = await wallet.getTransaction({ txid });
if (detail !== null && detail.raw === null) showAwaitingEnhancement(detail);
const status = await wallet.getSyncStatus(); // local read only
await wallet.sync({ signal }); // explicit finite sync
for await (const update of wallet.watchSync({ signal })) renderSync(update);
```

Amounts are exact bigint zatoshis, signed only for deltas. Byte results are owned `Uint8Array`; txid/block hash display uses checked lowercase 64-character hex without `0x`, converted explicitly from wire/DB byte order. JSON export needs an explicit bigint codec. Unknown account query → `ACCOUNT_NOT_FOUND`; `accounts.get` and unknown local txid → null; unavailable summary → `amounts: null`; empty supported pool → zero. Missing features fail explicitly, never fabricated zero balances.

Balance buckets preserve backend classification. `total` is economic, excluding uneconomic; `observedTotal` adds the backend uneconomic bucket in Rust. Backend account totals may include old Orchard records: retain those totals with the explicit `unsupportedLegacy` breakdown, excluded from v1 selection/send and supported `Pool` unions. Never relabel them Ironwood or silently omit them. History retains account-level deltas involving legacy funds with an explicit unsupported-legacy marker; supported inventory pages mark legacy rows omitted, and a request to act on them fails `UNSUPPORTED_POOL`. They are not a legacy-spending or automatic migration feature.

Do not use `AccountBalance::spendable_value` as an all-pool spendable total: it excludes transparent. Do not subtract operation reservations again. Source caveats require fixtures: transparent dust is classified by grouped sum rather than individual output; transparent locks can precede maturity/confirmation classification; unknown tx index can classify as regular. Shielded pending-spendability conflates confirmations and missing witnesses/scan state. Single-outpoint lookup and lock membership are not eligibility verdicts. Fix discrepancies in validated Rust/backend work, not JS accounting.

History rows are account/tx relative: preserve balance delta, total received/spent, nullable transaction-wide fee, height/index/time, expiry basis and shielding/pool-crossing fields. Fee must not be summed across account rows, change is not recipient payment, and delta sign alone is not direction. Deduplicate detail outputs by pool/index while retaining account relationships. `get_received_outputs` reads a view including external sent outputs; require an explicit receiving-account filter for receipt DTOs. Raw lookup conflates unknown and unenhanced; check local existence separately. Unknown memo differs from empty/text/binary; recovered address/change classification can be incomplete or heuristic. Full history completeness remains unknown even after scan catch-up.

Full notes/UTXO lists include known spent/pending/locked/uneconomic or unreconstructed records under explicit filters; selection APIs cannot supply this inventory. Expose note identity `(txid,pool,outputIndex)` and transparent outpoints, values, nullable mined/coinbase/lock information and known-spend state; leave per-item eligibility unknown until a complete Rust classifier is validated. Never expose note secrets, witnesses or raw SQL. Check the `u16` note-index boundary before memo calls. UTXO absence from a server response is not spentness. Public historical Orchard/Ironwood note/witness helpers exist on `WalletDb`, but do not implement current paginated all-pool inventory.

Pages use short coherent Rust reads, keyset cursors, default 50/max 200, limit+1 and no invented count. History sorts unmined first, then mined height/index descending with fixed null ordering and canonical txid tie-breaker. Inventory sorts pool/txid/index; operations sort creation sequence/ID. Filters precede limit and deduplication. Cursors bind DB identity, epoch/revision, account/filter/sort version and last key; any relevant mutation raises `CURSOR_STALE`. Persist a new `ext_` revision where atomic composition is valid, and change epoch on restore/recovery/migration/ownership changes. Height, rowid and `user_version` are not revisions. One owner queues reads/writes; `get_wallet_summary` opens its own transaction, so do not blindly nest it in another. Validate snapshot coherence and extension composition per operation.

## Sync and observation contract

`sync()` captures a finite network target, verifies identity, fetches bounded data, honors backend prioritized ranges (`Verify` first), and commits at safe batch boundaries. Rust ranges are half-open; light block ranges inclusive. `watchSync` shares one continuous runner and yields plain status records; stopping a subscriber does not undo another runner's work. `getSyncStatus` reports activity, scan state, captured target, actionable/delayed enhancement requests and last error without network I/O. No test-only callback or progress subscription exists.

`sync::run` lacks enhancement, interruption and progress notifications. Repeatedly service `transaction_data_requests`: `GetStatus` → `set_transaction_status`; `Enhancement` → raw fetch and `decrypt_and_store_transaction`; `TransactionsInvolvingAddress` → scoped transparent history plus `notify_address_checked` for completed empty intervals. Optional `GetSpendingTx` requires a real spend-index source; only verified unspent evidence permits `notify_output_verified_unspent`. Requests can grow or be delayed; empty queue is not complete history. `targetReached` means committed contiguous coverage at the captured target plus that run's actionable enhancement pass; required fetch failures reject retaining progress, cancellation reports stopped state. Unsupported target pinning must fail explicitly.

Fully scanned and maximum scanned heights differ. Backend progress estimates Sapling/Orchard work and omits Ironwood; expose it only as a limited work estimate, with zero denominator indeterminate. Do not derive all-pool completion or a fabricated percentage. Confirmations require inclusion identity on the same observed chain: depth = tip − mined height + 1, otherwise null/provisional. This is distinct from Rust input `ConfirmationsPolicy` (source default trusted 3/untrusted 10, zero-conf shielding when enabled).

Submission (`acknowledged/rejected/unknown`), chain observation, expiry, and local scanning remain distinct. B `TransactionStatus::{TxidNotRecognized,NotInMainChain,Mined}` has no rejection/finality enum; `NotInMainChain` does not prove mempool presence. Decode light uint64 height sentinels before number conversion (0 mempool; all ones off-main-chain); validate method-specific streaming semantics. Transport failure is never not-found. SQL expiry at maximum scanned height is not confirmed unmined evidence or a consensus expiry rule.

Reorg handling finds/reconciles the common ancestor, uses `truncate_to_height`'s actual returned height (possibly lower), reconciles cache/tree checkpoints, updates tip and replays. A status setter alone does not unmine an existing mined row. Retain tx/attempt history, invalidate cursors/proposals, and report `RECOVERY_REQUIRED` when retained witnesses/checkpoints cannot support rewind.

## Durable operations and exact-byte outbox

This is **missing product glue**, not an existing Zakura pending API. New Rust-owned external migrations create `ext_operations`, `ext_operation_steps`, `ext_proposals`, `ext_pczt_artifacts`, `ext_submission_attempts` and revision records. Stable operation ID precedes and differs from zero/one/many txids. Persist account/network, request/idempotency digest, approval/effect identity, lock owner/height, versioned proposal/artifacts, step dependencies, immutable exact bytes and a specified exact-byte digest (SHA-256). Txid alone is insufficient because stored raw bytes can change on txid conflict and authorization bytes need not be committed by txid.

Use `WalletDb::transactionally_with_extension` with transaction-scoped wallet and `ExtensionTransaction::{execute,query_row}` to atomically compose wallet mutation and `ext_` writes **where the actual call path supports it**. External migrations own DDL; the restricted executor denies DDL/PRAGMA/attach/transaction control and writes outside `ext_`; avoid `AUTOINCREMENT`'s `sqlite_sequence`. Its single-row mapper requires bounded keyset reads or a narrow Rust adapter for pages. Never expose SQL to TS or ship `WalletTest`/`test-dependencies`.

Required commit boundaries: allocate operation and owner before/with proposal locks; store reviewed standard-fee proposal using B `proto::proposal::Proposal::{from_standard_proposal,try_into_standard_proposal}` plus versioned envelope; validate decoded inputs anew. Enclose local fused creation or PCZT extraction plus exact-byte outbox association in one validated transaction. Fused proving can hold the write transaction; no invented private build-outside/store-inside API. Persist an attempt-start record before each network dispatch, then append its result as another event. Crash between start and durable result means unknown. No transaction or mutable Rust borrow spans network/device awaits.

`OutputLockStore::{lock_outputs,get_locked_outputs}` and T `unlock_proposal_inputs` already exist: advisory all-or-none owner locks, not consensus reservations. Selection uses expiry ≥ target; replacement of expired locks uses expiry ≤ known tip, with same-owner reacquisition. Unknown tip does not expire another owner. Revalidate after long review/proving. Backend stored spends and locks are distinct; cancelling/wait timeout is not permission to release or reselect.

Idempotency keys are wallet/network scoped: same key + same canonical intent finds the existing operation; different intent errors. Without one, a lost response can be recovered through `operations.list`, not guessed from repeating an amount. Resume attaches behavior and reports missing artifacts/authority, without sign/propose/broadcast. Persist no mnemonic/USK, closures or pointers. Explicit ephemeral storage cannot claim restart recovery and must never silently replace durable mode.

```ts
const resumed = await wallet.operations.resume({ operationId: savedOperationId });
const state = await resumed.snapshot();
renderPayment(state); // per-step txids, attempts, inclusion, expiry, blocked dependencies
await resumed.broadcast(); // reconciles first; policy permits only identical stored bytes
await resumed.wait({ confirmations: 3, timeoutMs: 120_000, signal });
```

Broadcast parents before dependent children; ambiguous/rejected parent blocks dependent dispatch pending reconciliation. Do not resend canonical-mined steps by default. `wait()` defaults to one positive confirmation and no deadline; immediate inspection uses `snapshot()`. Resolve only when every required step has checked inclusion at the threshold. No finalized tx → `NOT_FINALIZED`; known blocked/terminal observation → typed error with partial outcomes. Timeout/abort stops observation and carries latest state; reorg normally continues observation. Returned success is historical evidence, not irreversible finality. Ambiguous retry uses identical bytes—no new proof/signature, fee/expiry change or reselection. Fresh payment approval cannot bypass unresolved original spends.

## Remaining functional gates

All are future bounded proofs, not tests executed here; the [host plan](wasm-host-architecture.md#functional-acceptance-gates) supplies runtime/storage gates.

- Transaction fixtures: each supported transparent/Sapling/Ironwood pair and supported mixed inputs, shielding, multi-step transparent dependencies, correct fee/change/expiry, stale locks/plans, exact approved effects, wrong network/branch/assets, PCZT redaction/import tampering, partial signatures and allowed role orders; independently verify outputs, not equality of randomized proof bytes.
- Query fixtures: fresh/migrated schema, missing raw/memos/fees, external sends, cross-account fee/output deduplication, legacy records, dust/lock/coinbase discrepancies, full spent/uneconomic inventory, checked indices, cursor invalidation and atomic reads under same-height writes/reorgs.
- Sync fixtures: finite target, enhancement growth/delay/failure, transparent empty intervals/spend detection, scan gaps, Ironwood-only progress, safe cancellation/restart, same-height and deep reorg, actual rewind below requested height, missing checkpoints/witness recovery.
- Outbox crash matrix: before/after operation/lock commit, proposal/artifact commit, each local multi-step build/store boundary, outbox commit, attempt-start commit, transmission and response append; restart without signer, idempotency collision, immutable bytes and partial dependencies. Validate rollback/nested transaction behavior for each composition before claiming atomicity.
- Provider protocol/network fixtures and explicitly authorized future endpoint probes: wrong network, uint64 sentinels, SendResponse error/duplicate/unknown behavior, pruned/index-missing lookup, fork identity/depth, range boundaries/filter support, Ironwood tree/compact/v6 behavior, transparent coverage, TLS/auth/redacted diagnostics, browser gRPC-Web CORS/trailers/stream cancellation, bounded reconnect with no silent failover.

No project infrastructure, UIVK account import, mnemonic generation, spending-key export, persistent vault, concrete Ledger support, multisig or remote-wallet RPC is added. Performance measurement and possible N-API acceleration belong only to the [future benchmark placeholder](future-issues.md#future-issue-placeholder--wasm-performance-and-possible-native-acceleration).
