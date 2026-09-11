# Planned API namespace audit

::: info Historical planning context
Retained source analysis and candidate snippets may predate the declaration freeze. Use the [proposed v1 API book](../api/README.md) and [exact declarations](../api/public-api.md) for current examples and signatures. Settled decision semantics remain authoritative.
:::

Planning only, 2026-09-04. No production implementation or dependencies. **D18/D21 approve the wallet namespace tree below and flat placement of ordinary wallet, PublicClient and LightClient methods.** This audit is authoritative for those naming decisions over earlier sketches, subject to the [decision log](decision-log.md). Approval is not an implementation or support claim. It does not freeze signatures, package topology or unresolved backend coverage.

Use four approved shallow wallet namespaces: **addresses, accounts, pczt, operations**. Keep everyday orchestration and simple queries flat. A namespace groups operations over a resource with shared ownership or lifecycle; it is a property of the existing client, never another service to construct. The optional `zcash.wallet` composition prefix does not count as a resource layer. There is at most one resource namespace beneath each client.

## Audit coverage and comparison

The earlier seven-document namespace review is retained below; the integrated [transaction/query plan](transaction-query-api.md) and [host architecture](wasm-host-architecture.md) now govern signatures, mappings and runtime planning. The original documents were reviewed for API families, examples, ownership and constraints:

| Document | Finding and disposition |
| --- | --- |
| [Decision log](decision-log.md) | D08 preserves independent clients and shared composition; D14–D17 govern account/authority lifecycle. D18/D21 approve the namespace tree; D17 retains Zakura lifecycle semantics. |
| [API surface workplan](api-surface-workplan.md) | Covers codecs, transport, keys, scripts, notes, transactions, proofs, scanning, persistence, errors and extensions. Link this audit at G3; internal evidence catalogs are not caller configuration matrices. |
| [Keys/accounts/signers plan](keys-accounts-signers-api.md) | Reconciled the current sketch and onboarding examples with the approved accounts/address namespaces. Preserve custody, recovery and host constraints. |
| [Transaction API review](../research/transaction-api-inspiration-review.md) | Retain preferred independent clients, explicit stages and pending handle. Earlier `wallet.exportPczt/importPczt/resume` become the before examples here; alternatives A/C and third-party examples remain historical research. |
| [Zakura capability map](../research/zakura-api-capability-map.md) | Distinguishes direct local creation, single-step PCZT, scanning/query gaps and host outbox work. Namespaces do not fill those gaps. Earlier secret-store wording is superseded by D16a; no persistent spending authority is proposed here. |
| [Common landscape](../research/zakura-common-landscape.md) | Logical modules are candidate packaging, not required client namespaces or separate installations. Retain standalone crypto/codecs, scripts, proving and scanning seams without mirroring Rust modules into the wallet. |
| [Provider landscape](../research/provider-endpoint-landscape.md) | Public RPC and lightwallet transport remain separate. Earlier preset/service and browser-selector sketches are research alternatives: D08 governs `http`/`grpc`, hidden browser mechanics, lazy protocol/network handshake and injected clients. No caller method-support matrix. |

[viem's client guide](https://viem.sh/docs/clients/intro) separates public and wallet actions behind transports; its flat actions include `getBlockNumber`, `getBalance` and `sendTransaction`. [Wallet Actions](https://viem.sh/docs/actions/wallet/introduction) primarily map Ethereum wallet/signable RPC operations. Borrow direct calls, named arguments and explicit client responsibilities, not address-as-account identity. These official pages were checked on the audit date; the transaction review retains its pinned source comparison.

[ethers v6 providers and signers](https://docs.ethers.org/v6/api/providers/) use flat queries and signer operations, with `TransactionResponse.wait` as an object convenience. Borrow the useful returned-handle behavior, without requiring provider-bound signing authority. A Zcash payment may span multiple transactions and a wallet account owns many receive addresses, scanned notes and recovery metadata. That state gives accounts and addresses a stronger reason for grouping than an Ethereum RPC category does. Neither library's documentation navigation categories require runtime namespaces.

## Approved namespace tree

This is an ownership/naming catalog, not a claim that every leaf already has a supported Rust binding. Braces enumerate sibling methods; no extra service objects or pool sub-namespaces are implied. Existing broad families without settled individual names remain labeled as families.

```text
zcash.js (one coherent public product; subpaths still open)
├─ createPublicClient(...) → PublicClient
├─ createLightClient(...) → LightClient
├─ createWalletClient(...) → WalletClient
├─ createZcashClient({ public, light, wallet }) → zcash
│  ├─ public → same PublicClient
│  ├─ light  → same LightClient
│  └─ wallet → same WalletClient
├─ http(...), grpc(...)                         transport factories
├─ PublicClient                                flat, protocol-supported methods
│  └─ getBlock, getBlockHeader, getTip, getTransaction,
│     getTransactionStatus, getUtxos, getTreeState, getSubtreeRoots,
│     broadcastTransaction, waitForTransaction, watchTransaction,
│     block/range and mempool observation methods
├─ LightClient                                 flat, lightwallet protocol methods
│  └─ getTip, getServerInfo, getTreeState, getSubtreeRoots,
│     getTransaction, getAddressUtxos, getAddressBalance,
│     streamCompactBlocks, streamAddressTransactions, streamMempool,
│     broadcastTransaction
├─ WalletClient
│  ├─ addresses.{current,next,list,at}           D18 decided
│  ├─ accounts.{create,import,list,get,remove,attachSigner,detachSigner}
│  ├─ pczt.{export,import}                      wallet-associated handoffs
│  ├─ operations.{list,get,resume}              operationId, not txid
│  └─ send, shield, sync, watchSync, getSyncStatus,
│     getBalance, getHistory, getTransaction, listNotes, listUtxos,
│     propose, build, prove, sign, finalize, broadcast, close
├─ PendingPayment.{snapshot,wait,events,broadcast}   returned handle
├─ Signer.{getCapabilities,getAccount,authorize}    injected authority
├─ SignerBinding.dispose                           detach one binding
├─ addresses.{derive,find,decode,selectReceiver}     standalone; no allocation
├─ viewing.{export,toIncoming}, accountFromViewingKey
├─ pczt.{parse,serialize,inspect,combine,redact}      standalone artifact tools
├─ createCustomSigner                            injected signer adapter
│  Mnemonic/UFVK onboarding uses wallet.accounts; no generation or raw spending-key export
├─ accountIndex, diversifierIndex                   checked values
└─ standalone families: amounts/bytes, networks, address/payment-URI/memo
   and transaction codecs, transparent scripts, fee/selection policies,
   local prover/assets/jobs, low-level scanning, backupWallet/restoreWallet,
   typed errors/events and storage/transport/signer/prover adapters
```

Public and light leaf names beyond existing examples are suggested catalog spellings, requiring exact protocol mapping. Unsupported optional methods must fail explicitly; no server acquires an unimplemented method from this tree. Public `getUtxos` and light address queries concern transparent public data, not shielded balances. A signer interface's existing `getCapabilities/getAccount` are independent operations, not redundant prefixes inside a resource namespace. `accounts.get` is the collection lookup verb, not `accounts.getAccount`.

Advanced account upgrade helpers remain investigative: if included, prefer `accounts.planUpgrade/applyUpgrade` over top-level `planAccountUpgrade/applyAccountUpgrade`. This does not approve an in-place purpose upgrade. Advanced seed-handle creation/import helpers would use the same `accounts.create/import` lifecycle, not competing `createDerivedAccount/importDerivedAccount` public entry points. Seed-handle overloads are deferred under D20, not part of v1 onboarding.

## Family-by-family disposition

| Family | Placement and reason |
| --- | --- |
| Addresses | Approved `wallet.addresses.current/next/list/at`: one durable receive-allocation resource. Keep standalone `addresses.derive/find` distinct. |
| Accounts | **Approved: `wallet.accounts.create/import/list/get/remove/attachSigner/detachSigner`.** Consolidate existing partial namespace; remove flat `createAccount/importAccount` and ambiguous `accounts.add` from the current candidate. No compatibility aliases for an unimplemented API. |
| Transactions/payments | Keep `send`, `shield` and `broadcast` flat; `build/prove/sign/finalize` are flat advanced PCZT methods, not separable local stages. A payment intent, transaction bytes and a durable operation are different identities; `wallet.transactions.send` or `payments.send` would obscure that. Wallet transaction lookup is local history; public lookup is network evidence. |
| Proposals | Keep `wallet.propose` flat with immutable reviewable artifacts and explicit continuation arguments. A `proposals.create/list/get/execute` collection has no established independent durable repository; do not invent one. No `proposal.transactions.pczt` chain. |
| PCZT | Approved `wallet.pczt.export/import` for the paired wallet/proposal-associated exchange lifecycle. This removes the repeated `Pczt` suffix and distinguishes accepting a handoff from parsing bytes. Standalone `pczt` tools need no wallet; authorization belongs to a signer and proof execution to a prover. Keep wallet orchestration `prove/sign/finalize` flat rather than duplicate role methods under `wallet.pczt`. |
| Sync | Keep finite `wallet.sync`, optional continuous `watchSync`, and `getSyncStatus` flat. No callable namespace `sync.start/status` and no service to initialize. Low-level ingestion/rewind remains a separate advanced scanner contract. |
| Balances | Keep `wallet.getBalance({ accountId, ... })`: one snapshot query with pool/spendability breakdown and scan revision, no implicit sync. `balances.get` adds no lifecycle benefit. UIVK-only authority cannot claim shielded spentness/balance. |
| History | Keep `wallet.getHistory({ accountId, ... })` with pagination and local scan evidence; `wallet.getTransaction({ txid })` is the local detail query. No `history.transactions` or merger with public observations. Exact history query support remains validation work. |
| Notes | Keep `wallet.listNotes({ accountId, ... })` as an advanced query. Pool-tagged IDs and spendability do not require `notes.sapling/ironwood`; do not expose generic note CRUD or direct reservation mutation. Selection belongs to proposal policy and Rust. |
| UTXOs | Keep `wallet.listUtxos({ accountId, ... })` for locally tracked transparent outputs. Public/light queries stay flat and carry source provenance. No shared `outputs` abstraction erasing note/nullifier versus outpoint semantics. |
| Keys/viewing exports | Retain standalone viewing/derivation tools and opaque signer/custody handles. `viewing.export({ account: descriptor, ... })` explicitly discloses viewing authority. No `wallet.keys`, account secret getter, persistent vault, or required public keyring. |
| Pending operations | Approved `wallet.operations.list/get/resume`: the journal actually has a local identity and restart lifecycle. `get` returns a snapshot; `resume` rebinds a handle, not a new send or automatic signer prompt. No redundant `pending` subset namespace. Keep `pending.wait()` and exact-byte `pending.broadcast()` on returned handles. Durable storage remains unverified. |
| Remaining API families | Pure codecs/utilities, local proving jobs, low-level scanning, backup/restore, storage/transport adapters, errors, types and diagnostics retain their independent ownership. Do not create `wallet.services`, `wallet.runtime`, `wallet.storage.backups`, or protocol-specific service trees. Backend/worker details remain internal unless a concrete advanced operation needs them. |

**Settled v1 scope (D16/D19/D20):** zcash.js does not generate mnemonics or seeds. Applications use a reputable BIP39 npm package and pass the resulting mnemonic to `wallet.accounts.create({ mnemonic })` or `wallet.accounts.import({ mnemonic, accountIndex, birthday })`. Generation entropy/CSPRNG and mnemonic backup belong to the application and chosen package. V1 wallet imports accept mnemonic or UFVK authority; all raw spending-key export and the less-common imports in the [tracked future issue](future-issues.md) are excluded. Standalone UIVK viewing/address tools do not imply UIVK-only wallet support.

UFVK import directly calls `WalletWrite::import_account_ufvk` with public `viewOnly?: boolean`, default `false`. Omitted/false maps internally to `AccountPurpose::Spending { derivation: None }` and retains spend-supporting state; it does not imply, store or manufacture a spending key or signer. `true` maps to `AccountPurpose::ViewOnly` and may require reconstruction/rescan before later spending. Zakura has no public `import_account_uivk`; UIVK-only account import is excluded from v1 and stays in the [tracked future issue](future-issues.md), without inventing a backend path.

The default address request maps exactly to Zakura’s `UnifiedAddressRequest::AllAvailableKeys`: include/require every available supported receiver on the account (transparent, Sapling and the Orchard-encoded receiver used for Ironwood). Publishing this UA links these receivers and permits transparent receipt. Shielded-only is an explicit supported request, never the default; missing required receivers fail without fallback.

Mnemonic recovery accepts every checksum-valid standard BIP39 word count: 12/15/18/21/24. Any preference for 24 words is documentation only, with no runtime warning or result field. zcash.js generates no mnemonics or seeds (D19).

The generic external signer/PCZT seam remains in v1. Concrete Ledger support is only a documented stub/placeholder and is unsupported until later device, app/firmware, pool, version and display/review qualification. Multisig and remote-wallet RPC are out of current scope; do not design them now (D25).

## Exact Zakura account and address mapping

Account lifecycle mappings use [W3/W5 in the keys plan](keys-accounts-signers-api.md#source-evidence-and-semantic-differences) and the pinned wallet `data_api.rs`. Names are JS facade choices; allocation, derivation and database rules stay in Zakura.

| Approved method | Exact backend or glue | Required semantics |
| --- | --- | --- |
| `accounts.create({ mnemonic, ... })` | Mnemonic-to-seed boundary → `WalletWrite::create_account` | Zakura transactionally chooses the next sequential ZIP-32 index using stored seed fingerprint/derivation metadata. Return DB account plus USK-backed memory signer. No JS index counter, gap-filling ledger, or allocation by `list().length`. `accounts.create({ mnemonic })` has no birthday input: after explicit sync it derives `AccountBirthday` internally from one coherent current locally verified wallet database chain/tree snapshot. No hidden network request or implicit sync occurs; unavailable/stale local state fails `SYNC_REQUIRED` before mutation. See [creation semantics](../api/accounts-signers.md#choose-the-onboarding-path). Recovery requires an explicit birthday or full scan. |
| `accounts.import({ mnemonic, accountIndex, birthday, ... })` | `WalletWrite::import_account_hd` | Exact supplied recovery index and explicit birthday or full scan. Preserve HD provenance and return account plus memory signer. Not standalone derive followed by UFVK import, which would lose the exact lifecycle mapping. |
| `accounts.import({ viewingKey, birthday, viewOnly?, ... })` | `WalletWrite::import_account_ufvk` | UFVK import directly calls `WalletWrite::import_account_ufvk` with public `viewOnly?: boolean`, default `false`. Omitted/false maps internally to `AccountPurpose::Spending { derivation: None }` and retains spend-supporting state; it does not imply, store or manufacture a spending key or signer. `true` maps to `AccountPurpose::ViewOnly` and may require reconstruction/rescan before later spending. Zakura has no public `import_account_uivk`; UIVK-only account import is excluded from v1 and stays in the [tracked future issue](future-issues.md), without inventing a backend path. If a descriptor overload ships, it must use this same path and validate UFVK authority. |
| `accounts.list()` / `accounts.get({ accountId })` | `WalletRead::get_account_ids` + `get_account` / `get_account` | List records or one record (`null` for successful missing lookup). Signer status is session glue, never inferred from spending-purpose metadata. |
| `accounts.remove({ accountId, acknowledge })` | `WalletWrite::delete_account` + host coordination | Delete local account data; detach bindings and invalidate dependent handles. Reject while unresolved work/reservations require reconciliation; no implicit abandonment. Does not erase chain funds, backups or injected signer secrets. |
| `accounts.attachSigner/detachSigner` | Host binding registry and verified key matching; no Zakura account creation/import | Match all registered components and authorized inputs, not fingerprint alone. Attachment does not upgrade viewing keys, purpose, witnesses or scan state. Return `SignerBinding`; dispose detaches that binding. |
| `addresses.current({ accountId, request })` | `WalletRead::get_last_generated_address_matching` | Read latest generated matching address; return `null` when none matches. Do not allocate on a miss. This source returns an address, not an index tuple: any richer DTO needs a validated read-only lookup. |
| `addresses.next({ accountId, request })` | `WalletWrite::get_next_available_address` | Generate, persist and mark exposure before return; source yields address/index. Serialize writes; lost responses need operation reconciliation before retry. |
| `addresses.list({ accountId })` | `WalletRead::list_addresses` | Read recorded address information, not enumerate the entire derivation space. Preserve metadata and source filtering; exact DTO/pagination stays open. |
| `addresses.at({ accountId, index, request })` | `WalletWrite::get_address_for_index` | **A write:** generate/persist/mark exposure at this exact diversifier index. No search-forward fallback; invalid required receiver can fail. Changing receivers at an exposed index fails. Enforce transparent discovery-range recovery policy. |

The four address methods map directly to the named Zakura lifecycle primitives; this is not evidence that every transparent-only projection is a direct primitive. Unified and mixed-account projection behavior and pure transparent allocation still need the existing W5 validation. Invalid account, unavailable receiver and successful no-match are distinct outcomes; JS error translation must preserve them. Exact absence/error schemas beyond `current` remain under review.

D17 allocates from Zakura's stored metadata, not a promise of globally never-reused indices across deleted/restored databases. Account ID (DB scoped), ZIP-32 index, diversifier index, receiver address, operation ID and txid remain distinct. `accounts.get` returns a record, never an account service with its own `.addresses` or `.transactions` subtree.

## Ownership and invariant rules

1. **Clients and composition.** Each factory is independently usable. Public owns HTTP JSON-RPC interactions; light owns low-level lightwallet transport/streams; wallet owns its Zakura SQLite session, scan state, accounts, exposure metadata and operation coordination. `zcash` references the same injected instances and enforces one network identity. No copying state or implicit ownership of injected clients, signer devices or keyrings. D08's standard `grpc(url)` hides permitted browser gRPC-Web mechanics; there is no project-operated infrastructure or required capability/configuration matrix.
2. **Namespaces and handles.** Namespace properties share their parent wallet's lifetime, worker and serialized mutation boundary; no namespace constructor, independent connection, `init`, or `close`. Wallet close detaches bindings and invalidates wallet-dependent handles; it does not dispose shared injected authority. Returned snapshots are data; `PendingPayment`, signer bindings and proof jobs have only the behavior justified by their own lifecycle. Never retain mutable Rust borrows or SQLite transactions while awaiting a device/JS callback.
3. **Authority.** SQLite persists viewing and derivation metadata, never mnemonic/USK. A creation/import result gives the caller ownership of its memory signer; attachment to a wallet is a separate session relationship. Recommend explicit attachment for both results, so creation does not silently authorize later spending. Spending secrets remain memory/application/external custody (D16a). Viewing export is explicit; v1 has no raw spending-key export or export authority; neither ordinary JSON nor wallet backup discloses secrets. View-only purpose upgrades and duplicate/subsuming key imports keep the keys plan's collision/recovery rules.
4. **Wallet resources.** Account-scoped operations take explicit `accountId`; multi-account proposals pin their account set. All namespaces share the same reservation/scan revision rules. No per-account nested wallet, hidden first-account default or JS note/UTXO/index ledger. Address allocation differs from standalone deterministic derivation; read queries never acquire hidden synchronization or allocation side effects.
5. **Proposal and authorization.** `send` and manual stages share one proposal engine. Bind approval to exact recipients, amounts, fee, receiver choices, network, target context, input set and dependencies; stale plans require revalidation/new approval, not mutation under existing approval. Direct local authorization supplies `SpendingKeys` to `create_proposed_transactions` and supports multi-step proposals. External PCZT uses `create_pczt_from_proposal`, currently single-step; do not force local sends through PCZT or split dependent steps in JS. Conditional role ordering remains conditional, not a universal sign/prove pipeline.
6. **PCZT and proving.** `wallet.pczt.export` retains the wallet's full proposal association and exports a minimally disclosed exchange; `import` validates returned mutations, signatures, network and reviewed effects, not just parseability. Standalone parse/combine cannot attach arbitrary bytes to a wallet operation or grant approval. Wallet `finalize` uses the mapped extraction/storage path; generic extraction alone is not wallet import. Sapling proof-generation authority is not a UFVK; prover receives only required sensitive material, not a convenience USK. Parameter integrity, caching and worker-memory requirements remain in scope; remote proving remains deferred.
7. **Broadcast and observation.** Finalization never submits. Persist exact finalized bytes and their operation/step/txid association before dispatch. Public/light raw broadcast returns a plain per-attempt `acknowledged | rejected | unknown` report and does not create a wallet journal. Wallet send/broadcast and pending handles retain batch dependencies and partial outcomes. Unknown submission retains reservations and is reconciled by the same txid; explicit rebroadcast uses identical bytes, never automatic rebuild/reselect/resign. Endpoint acknowledgment is not inclusion; confirmation depth, evidence source, block identity, reorg and expiry stay explicit. Cancelling `wait` stops observation, not broadcast or signatures.
8. **Operations and durability.** `operations` is host journal glue, not a claimed Zakura collection API. Store identifiers/records in the wallet database, never closures or secret-bearing public observer tokens. Opening automatically reconciles all database operations without separately saved IDs (D26); `resume` only reattaches a selected handle and never reacquires authority. Unfinished work reports missing material for separate explicit continuation. The [recovery contract](../api/operations.md) governs offline/online startup, consent and durable bounds. If durable artifact storage cannot be validated, label memory operations ephemeral and reject unavailable restart recovery. The transaction/query plan specifies additive ext_ journal design; functional validation still blocks durability claims.
9. **Protocol scope.** Transparent + Sapling + Ironwood remain in scope; Sprout stays deferred. Orchard receiver/key encoding is not legacy Orchard spending permission or Ironwood activation evidence. Preserve explicit pool/network/branch checks, required-receiver failures and no privacy-weakening fallback. Common 1.0.0 remains the coherent initial graph; source evidence from 1.1.0 does not authorize mixed dependencies.

## Before and after examples

Each pair is an alternative spelling of the same intended work, not two operations to execute. Objects and bytes are application supplied. Names other than D18 remain candidates.

```ts
// Before: the current plan splits one account lifecycle across two levels.
const created = await wallet.createAccount({ mnemonic });
const restored = await wallet.importAccount({ mnemonic, accountIndex, birthday });
await wallet.accounts.attachSigner({ accountId: restored.account.id, signer: restored.signer });

// After: explicit sync establishes local state; create itself performs no network work.
const synced = await wallet.sync();
if (!synced.targetReached) return;
const created = await wallet.accounts.create({ mnemonic });
const restored = await wallet.accounts.import({ mnemonic, accountIndex, birthday });
await wallet.accounts.attachSigner({ accountId: restored.account.id, signer: restored.signer });
const record = await wallet.accounts.get({ accountId: restored.account.id });
const tracked = await wallet.accounts.import({ viewingKey: ufvk, birthday });
// Replaces accounts.add({ account: viewingDescriptor, ... }); no implicit authority.
```

```ts
// Before: flat hypothetical spellings / historical receive conveniences.
const current = await wallet.getCurrentAddress({ accountId, request });
const next = await wallet.getNextAddress({ accountId, request });
// After (approved): current is a read; next and at persist exposure.
const current = await wallet.addresses.current({ accountId, request });
const next = await wallet.addresses.next({ accountId, request });
const issued = await wallet.addresses.at({ accountId, index, request });
const records = await wallet.addresses.list({ accountId });
// Standalone, unallocated derivation remains a different operation.
const derived = await addresses.derive({ account: descriptor, index, request });
```

```ts
// Before: research candidate B.
const exchange = await wallet.exportPczt({ proposal, approval });
const accepted = await wallet.importPczt({ exchange, bytes: returnedBytes });
const resumed = await wallet.resume({ operationId });
// After: one handoff namespace and one journal namespace.
const exchange = await wallet.pczt.export({ proposal, approval });
const accepted = await wallet.pczt.import({ operationId: exchange.operationId, bytes: returnedBytes });
const snapshot = await wallet.operations.get({ operationId });
const resumed = await wallet.operations.resume({ operationId });
await resumed.wait(waitOptions); // does not repeat signing or rebuild a spend
```

```ts
// Common path stays short; explicit account selection and policies remain.
const pending = await wallet.send({ accountId, to: recipient, amount: 125_000n });
await pending.wait(waitOptions);
// Standalone public query and raw broadcast still require no wallet.
const transaction = await pub.getTransaction({ txid });
const report = await pub.broadcastTransaction({ bytes: finalizedBytes });
```

## Rejected abstractions and unresolved naming

Reject `wallet.accounts.get(id).addresses.next()`, `wallet.transactions.proposals.pczt.sign()`, per-pool namespaces, `getAccountService()`, `wallet.sync.start()`, and parallel aliases such as `wallet.send` plus `wallet.payments.send`. They add stateful-looking objects or navigation without a new owner. Reject `addresses.getCurrentAddress`, `accounts.getAccounts` and generic resource CRUD for notes, keys or transactions. Reject capability/configuration matrices as public setup; internal evidence and signer compatibility checks remain necessary. No namespace implies a new package, worker, persistent secret vault or required account keyring.

Unresolved choices are narrow naming/signature questions, not permission to change settled semantics:

- D18/D21 settle the namespace names, including `accounts.import` and its recovery/collision semantics.
- `pczt.export/import` is approved. Clarify proposal association: export is a wallet handoff and import is not authorization approval.
- `operations.list/get/resume` is approved because records exist before txids and include interrupted authorization/build work; do not extend it to a generic scheduler for sync/proof jobs without a use case. The transaction/query plan specifies candidate DTOs, keyset pagination, additive extension journal and explicit continuation; implementation and functional proof remain open.
- `getHistory` versus `listTransactions`, `listUtxos` versus `listUTXOs`, and `getSyncStatus` versus `getSyncState`: use the tree's spellings for review, then test discoverability. Do not add both spellings.
- The integrated transaction plan uses `send({ proposal })` for exact reviewed local execution; `build` is single-step PCZT construction. No separate `executeProposal` alias or universal staged local path is proposed.
- Address result DTOs, list filters/pagination, null/error translation and durable retry IDs need G3 review. `current` does not acquire an index by inventing one, and `at` remains a write regardless of its short name.
- Account import overloads should return precise types for mnemonic versus UFVK input. Descriptor overloads and upgrade-helper delivery remain open; D22 settles `viewOnly?: boolean` with default false; seed/raw-key helper facilities are deferred under D20 and export exclusion is settled by D16; no second lifecycle or default seed index is introduced to resolve them.

## Validation

Documentation review only. The integration checked this tree against the transaction/query and host plans, preserved D18/D21 namespaces, and reconciled exact local execution versus PCZT semantics. `git diff --check` and explicit no-index whitespace checks cover the untracked docs. All 11 Markdown files passed NUL, trailing-whitespace and local-link/anchor checks; targeted stale-default/scope/staging/benchmark searches were reviewed. No builds, runtime tests, network transactions or dependency changes were made.
