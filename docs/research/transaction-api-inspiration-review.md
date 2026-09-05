# zcash.js API-shape review

**Historical API-shape research.** Current [transaction/query planning](../planning/transaction-query-api.md) supersedes candidate signatures and lifecycle alternatives below: explicit accountId, `send({ proposal })`, approved pczt/operations namespaces and PCZT-only advanced stages. [WASM host planning](../planning/wasm-host-architecture.md) governs runtime/storage. Third-party observations and rejected alternatives remain evidence, not active API commitments.

Research date: **2026-09-04**. Research and design only; no library implementation. Intended initial scope: **transparent + Sapling + Ironwood**, with independently usable public, light, and wallet clients.

**Preliminary recommendation, pending the Zakura symbol map:** use viem-style client factories and named arguments, explicit proposal/artifact stages, and a durable Zcash-specific payment handle for the high-level `send` operation. Keep public broadcast and observation independent of wallet state. Borrow ethers' convenient observation methods without making a provider-bound response object the persistence model.

## Evidence and scope

| Project | Reviewed version and immutable revision | Provenance |
| --- | --- | --- |
| viem | **2.56.3**, `3db6cdf15969e6b2ff9a2899e2ba65b6f90460f2` | [Live latest-release API](https://api.github.com/repos/wevm/viem/releases/latest), [release](https://github.com/wevm/viem/releases/tag/viem%402.56.3), [commit](https://github.com/wevm/viem/commit/3db6cdf15969e6b2ff9a2899e2ba65b6f90460f2), [package][V-package]. Release published September 2, 2026. |
| ethers | **6.17.0**, `3ea4c226dd0b3a074abf90748de9d11192027f4f` | [Live latest-release API](https://api.github.com/repos/ethers-io/ethers.js/releases/latest), [release](https://github.com/ethers-io/ethers.js/releases/tag/v6.17.0), [commit](https://github.com/ethers-io/ethers.js/commit/3ea4c226dd0b3a074abf90748de9d11192027f4f), [package][E-package]. Release published June 18, 2026. |
| WebZjs | Local clean checkout `a50df944c32243cb8da9f86e7d52cb65ac926439`; wallet crate **0.1.0**, private web-wallet package **0.0.0** | `/tmp/WebZjs`, origin `https://github.com/ChainSafe/WebZjs.git`; [wallet manifest][W-manifest], [app manifest][W-app-package]. No claim that this checkout is the latest release. |
| WebZjs backend dependency | ChainSafe/librustzcash-nu61 `52efe30ef39b2d1871be5673d1921ff33472b347` | [Cargo manifest][W-cargo] and [lockfile][W-lock], branch `feat/snap-nu61`. This is a fork dependency, not proof of upstream or Ironwood behavior. |

The browser's cached viem latest-release page initially resolved to 2.55.18. The live GitHub connector returned 2.56.3; this review uses the latter's source. Current ethers documentation identifies 6.17.0. viem documentation pages that the browser rejected as `text/markdown` were read from the official repository at the pinned commit. See [public-client documentation][V-doc-public], [custom-client documentation][V-doc-custom], and [preparation documentation][V-doc-prepare]. Source takes precedence where comments and documentation disagree.

WebZjs is evidence of an existing browser architecture and its limitations, **not a compatibility target, comprehensive capability inventory, or Ironwood specification**. Its reviewed transaction code uses Orchard, Sapling and transparent APIs; a search of its crates found no Ironwood symbols. This report does not equate Orchard with Ironwood, assert an Ironwood activation schedule, assign it encodings, or assume its PCZT/proving support. Proposed names below are design sketches, not discovered Zakura symbols.

## 1. Exact composition and query conventions

### viem

`createPublicClient({ chain, transport: http(url) })` and `createWalletClient({ chain, transport, account? })` are separate factories built on `createClient`. A transport is a factory receiving client context, not merely a URL: HTTP supports fetch options, hooks, batching, retry and timeout configuration; `custom(provider, config?)` adapts a `request` provider. `fallback([...])` composes transports and can rank them. Separate clients can share transport configuration without sharing key authority. [Factories][V-client], [public factory][V-public], [wallet factory][V-wallet], [HTTP][V-http], [custom][V-custom], [fallback][V-fallback].

A wallet's `account` may be hoisted or overridden on an action. An address is parsed as a JSON-RPC account: signing belongs to the connected wallet/node. A local account carries methods such as `signTransaction`, rather than requiring transport-held keys. The account union also includes smart-account machinery; it should not be reduced to “address or private key.” Method availability and runtime wallet support are distinct. A public client is an API surface, not a security sandbox around its raw `request`. [Account types][V-accounts], [send][V-send].

Representative shapes, with generics abbreviated:

```ts
publicClient.getBalance({ address, blockNumber?, blockTag?, blockHash?, requireCanonical? }): Promise<bigint>
publicClient.getTransactionReceipt({ hash }): Promise<TransactionReceipt>
publicClient.readContract({ address, abi, functionName, args?, ... }): Promise<AbiResult>
publicClient.simulateContract({ address, abi, functionName, args?, account?, ... }):
  Promise<{ result: AbiResult; request: WriteContractRequest }>
```

The balance block selectors are alternatives in the type: number, tag, or hash; `requireCanonical` is available only with a hash. Values are decoded to `bigint`; receipts are formatted records, with chain-dependent result types. Receipt lookup throws `TransactionReceiptNotFoundError` for a null RPC result. ABI literals infer argument and result types; raw JSON-RPC hex quantities are not the ergonomic result model. Simulation is a read-only call producing a decoded result plus a reusable write request, not a signed transaction, reservation or future-success guarantee. [Balance][V-balance], [receipt][V-receipt], [read][V-read], [simulation][V-simulate].

### ethers

`new JsonRpcProvider(urlOrFetchRequest?, network?, options?)` packages transport, network discovery, caching and RPC behavior in a provider object. `new BrowserProvider(eip1193, network?, options?)` wraps an injected wallet and `await provider.getSigner(addressOrIndex?)` obtains its signing facade. `new Wallet(privateKey, provider?)` supports local authority; `wallet.connect(provider)` returns a connected wallet. An `AbstractSigner` can have a null provider, but population and sending require one. `VoidSigner` represents an address without signing credentials. Contract runners can expose different subsets of read/send functionality. [JSON-RPC][E-jsonrpc], [browser][E-browser], [signer][E-signer], [local wallet][E-wallet], [provider and runner interfaces][E-provider].

```ts
provider.getBalance(address: AddressLike, blockTag?: BlockTag): Promise<bigint>
provider.getTransaction(hash: string): Promise<TransactionResponse | null>
provider.getTransactionReceipt(hash: string): Promise<TransactionReceipt | null>
provider.call(tx: TransactionRequest): Promise<string>
provider.estimateGas(tx: TransactionRequest): Promise<bigint>
```

ethers favors positional selectors and optional trailing parameters. `AddressLike` permits address resolution rather than only a literal string; `TransactionRequest` accepts broad input forms such as `BigNumberish`. Response objects normalize values and attach provider-powered methods; block numbers/nonces are generally numbers, value/gas amounts bigint. A missing receipt is null, contrasting with viem's throwing lookup. `PreparedTransactionRequest` is a normalized field type; its name does not imply every optional network-dependent field has been populated. [Interfaces and normalized request][E-provider], [implementation][E-abstract].

**Transfer judgment:** choose named argument objects for extensibility and mutually exclusive query selectors; return bigint zatoshi amounts and deliberate optionality. Public transaction data and wallet-private history should be different types. A shielded wallet balance needs spendable/pending breakdowns and a scan snapshot; copying `getBalance(address): bigint` would conceal essential state. Preserve local-versus-external signer composition, but keep account identity, viewing authority, proving material and spending authority separate.

## 2. Preparation, simulation, signing, sending and returned values

| Operation | viem 2.56.3 | ethers 6.17.0 | Implication for zcash.js |
| --- | --- | --- | --- |
| Prepare | `prepareTransactionRequest({ account?, to?, value?, parameters?, ... })` fills selected fields; defaults include chainId, fees, gas, nonce, type, blobVersionedHashes. Supports chain preparation hooks. [Source][V-prepare] | `signer.populateTransaction(tx)` resolves fields, checks sender/network and fills nonce, gas limit and fee/type data. `populateCall` is less extensive. [Source][E-signer] | Distinguish payment intent, proposal with selected inputs, and serialized transaction. “Prepare” alone is too vague. |
| Estimate | `estimateGas({ account?, to?, value?, ... }): Promise<bigint>`; contract simulation can produce a write request. [Gas][V-estimate], [simulate][V-simulate] | `provider/signer.estimateGas(tx)`; `provider/signer.call(tx)` executes a read-only call. [Provider][E-abstract], [signer][E-signer] | Fee quotation, wallet planning, proof work and node acceptance checks are different operations. Do not invent `simulateTransaction` as an EVM-equivalent service. |
| Sign only | `walletClient.signTransaction(request)` returns serialized signed bytes/hex. It queries chain ID and validates the active chain unless explicitly bypassed; it does not run full preparation. Local `account.signTransaction` is the lower-level offline route. [Source][V-sign] | `signer.signTransaction(tx): Promise<string>`; `BaseWallet` resolves addresses and signs without populating network fields. Node signer support depends on `eth_signTransaction`. [Local][E-wallet], [RPC signer][E-jsonrpc] | Signing must not imply synchronization, proving or broadcasting. Require appropriate artifact and authority. |
| Automatic send | Local account: prepare, sign, then raw submission. JSON-RPC account: delegate `eth_sendTransaction` (with wallet-specific fallback logic). Returns `Hash`. [Source][V-send] | `AbstractSigner.sendTransaction(tx)`: populate, sign, provider broadcast. Returns `TransactionResponse`. RPC signer instead sends via node and polls transaction lookup to obtain that response. [Signer][E-signer], [RPC][E-jsonrpc] | Convenience should orchestrate the same stages exposed manually. Document when its promise resolves. |
| Broadcast existing bytes | `sendRawTransaction(client, { serializedTransaction }): Promise<Hash>`, no account required by the function's client type. In this release its source lives under **actions/wallet**, despite older public-action URLs. Retry count explicitly zero. [Source][V-raw] | `provider.broadcastTransaction(signedTx): Promise<TransactionResponse>`; parses bytes, checks returned hash and attaches replacement tracking using a starting block. [Source][E-abstract] | Put keyless broadcast on the public client, irrespective of upstream folder taxonomy. Submission response is not inclusion. |
| Send and wait | `sendTransactionSync` returns a receipt, not a hash; it has synchronous-RPC/fallback waiting paths and reverted-receipt handling. [Source][V-syncsend] | `const tx = await signer.sendTransaction(txRequest); await tx.wait(...)`. | Prefer the explicit name `sendAndWait`, if offered. In a shielded SDK, “sync” already means wallet synchronization. |

The current viem `sendTransactionSync` source contradicts a cached documentation page's “Returns Hash” section. Use its receipt return type, not that section. Automatic local viem and ethers flows need network queries even with local keys; “local account” does not make preparation offline. Conversely, an externally managed account may not support exportable signatures at all. [Source][V-syncsend], [cached official page](https://viem.sh/docs/actions/wallet/sendTransactionSync).

A txid and a viem-like hash are not distinct lifecycle abstractions: both are scalar identifiers. Naming the Zcash field `txid` is clearer than adopting Ethereum's `hash`; formatting, byte order and validation must follow the eventual backend contract. Do not copy `0x`-prefix assumptions into an unchecked TypeScript alias.

Current viem preparation can attempt `eth_fillTransaction` before filling fields individually; chain-specific sponsorship paths can obtain a relay fee-payer signature as a side effect. It also initially aliases the argument object and assigns default account/parameters. Thus neither “prepare is pure” nor “prepare can never involve another authority” is a safe universal characterization of this extensible API. The proposed Zcash proposal contract should explicitly prohibit authorization side effects. [Preparation implementation][V-prepare].

## 3. Waiting, replacement, timeout and reorg semantics

| Detail | viem | ethers |
| --- | --- | --- |
| Wait shape | `waitForTransactionReceipt({ hash, confirmations?, timeout?, pollingInterval?, retryCount?, retryDelay?, checkReplacement?, onReplaced? })` returns receipt. | `TransactionResponse.wait(confirms?, timeout?)` returns receipt or null; `provider.waitForTransaction(hash, confirms?, timeout?)` is a separate operation. |
| Defaults | One confirmation; 180,000 ms timeout; timeout 0 disables its timer. Retry count 6 for relevant missing transaction/block lookups; exponential retry delay. | Response wait: one confirmation, timeout 0/no timer by default. Provider wait: one confirmation; omitted timeout means no deadline, but explicit 0 installs a zero-duration timer. |
| Zero confirmations | Still waits for a receipt if absent; it is not a nullable immediate “peek.” | Both wait entry points can return null immediately when confirms is 0 and no receipt exists. |
| Execution failure | Receipt waiter resolves a receipt even with reverted status; inspect status. `sendTransactionSync` has additional failure handling. | Response `wait` throws `CALL_EXCEPTION` for status 0. Provider `waitForTransaction` returns the receipt without that check. |
| Replacement | Enabled by default unless chain config disables it. Uses same sender + nonce. Callback includes reason, old/new transaction and replacement receipt; waiter resolves replacement receipt. | A response marked replaceable scans from its configured starting block; same sender + nonce detection throws `TRANSACTION_REPLACED`, with reason, cancelled flag, replacement and receipt. Plain hash-based provider wait has no equivalent replacement scan. |
| Reasons | `repriced`, `cancelled`, `replaced`, based on Ethereum transaction fields. | Same labels, but different exact predicates; ethers' self-send cancellation test also checks empty data. Its cancelled flag is true for “replaced” as well as “cancelled.” |
| Reorg limits | Once it has cached a receipt, the multi-confirmation path counts new height against that receipt rather than re-fetching/canonicality-checking it every block. | Response confirmations use height arithmetic; provider wait re-fetches receipt on blocks, but this is not an irrevocable-finality promise. Orphan event types exist; docs say support is incomplete. |
| Cancellation | No per-wait `AbortSignal` in this waiter signature. Timeout cleans up polling/observation. | No per-wait `AbortSignal` in these signatures. Response waiter removes listeners on resolution/timeout. Provider-wide teardown is not transaction cancellation. |

Evidence: [viem waiter implementation][V-wait], [ethers response wait and confirmations][E-provider], [ethers provider wait][E-abstract]. Official [ethers provider documentation](https://docs.ethers.org/v6/api/providers/) explicitly describes zero-confirmation null results and incomplete orphan-filter support.

**Transfer judgment:** confirmations include the inclusion block; define that arithmetic explicitly in zcash.js. Separate spending-input confirmation policy from an application's observation threshold. Neither is named “final” without a precise guarantee. A resolved wait is a snapshot; a continuing watcher must be able to report reorgs and reduced confirmations.

Do not transplant sender/nonce replacement detection, repricing, or cancellation transactions to Zcash. Expose observed conflicts or supersession only when the backend can substantiate them, with evidence and provenance. An observation timeout means “stopped waiting,” not “transaction failed.” Wallet scan lag and network inclusion are different clocks: a payment may be observed publicly before the wallet has scanned its effects.

## 4. Authority, extension, network and failure boundaries

viem offers action functions `action(client, parameters)`, decorated clients and `.extend(client => actions)`. Current `extend` protects base-client fields and shallow-merges overlapping plain-object namespaces. Actions use `getAction` in orchestration to respect decorated actions. Chain types customize request/response formatters, serializers, fees and preparation. These are useful composition mechanisms, but they are not a permission model. Transport middleware cannot safely substitute for wallet planning or user approval. [Client][V-client], [preparation][V-prepare], [chain types][V-chain], [custom-client guide][V-doc-custom].

ethers uses subclassable providers/signers and named provider/network plugins: `attachPlugin`, `getPlugin`, and network plugins such as fee/ENS/gas configuration. `Network.chainId` is bigint and `Network.from` normalizes runtime network descriptions; this is less compile-time chain-specific than viem's generic inference. Browser wallet network changes must still be checked at runtime. [Provider plugin hooks][E-abstract], [network][E-network], [browser][E-browser].

For zcash.js, inject transport, scanner/synchronizer, planner, prover, signer and storage as explicit capabilities. Public and light clients must construct without a wallet, keys or a prover; an offline wallet can open storage without contacting either. A wallet can be view-only or planning-capable without being signing-capable. A prover must receive only the material its actual backend requires; proving material is not automatically public or equivalent to a viewing key. External signing should authorize decoded transaction content, not trust a caller's summary. Namespaced action extensions can add conveniences, but replacing a planner/serializer must be explicit configuration before proposal approval; middleware must not rewrite approved payments or automatically repeat signer prompts.

Network typing should associate addresses, accounts, proposals and finalized bytes with a validated network descriptor. Runtime checks remain necessary after deserialization or an external signer/network change. Keep consensus/network identity, endpoint capabilities, supported pools and activation-dependent transaction rules distinct. A `transparent | sapling | ironwood` feature selection is a requested library surface, not a claim that all three are active on every network or height. Reject unsupported routing; never silently downgrade a requested private payment.

viem's `BaseError` carries causes and supports walking the cause chain; action-specific error unions aid discovery but JS promises do not have typed rejection channels. ethers has machine-readable codes and `isError(error, code)` narrowing, including `ACTION_REJECTED`, `TIMEOUT`, `NETWORK_ERROR`, `CALL_EXCEPTION` and `TRANSACTION_REPLACED`. [viem errors][V-errors], [ethers errors][E-errors]. Neither send API is a durable proof-progress journal. Neither a thrown transport error nor a rejected response-construction promise proves the submitted bytes were not accepted.

**Recommended failure contract:** structured errors with `code`, `stage`, `cause`, `operationId?`, `txids?`, and recovery guidance. Distinguish invalid input, unsupported capability, insufficient spendable funds, stale proposal, signer rejection, proof failure, storage failure, explicit submission rejection, unknown submission outcome, observation timeout and observation unavailable. Do not collapse all proposal errors into insufficient balance or all missing lookups into expiry.

Cancellation should mean cooperative local interruption where supported. An `AbortSignal` may stop a scan/proof/wait or prevent a not-yet-dispatched broadcast; after dispatch it cannot revoke network acceptance. Worker termination must not silently release uncertain spends. Progress should be stage events with optional measured work units, not fabricated percentages. Logging middleware should omit memo, viewing/proving material, keys and private selections by default.

## 5. What the local WebZjs actually exposes

The following are **exported Rust/wasm-bindgen shapes**, abbreviated as TS for discussion. Direct u64 parameters/results normally map through wasm-bindgen to bigint and byte vectors to Uint8Array; nested serde values follow their serializer. Generated declarations were not present/validated, so these are not asserted as a complete generated .d.ts. [Binding source][W-bind].

| API | Observed behavior |
| --- | --- |
| `new WebWallet(network, lightwalletdUrl, trustedConfirmations, untrustedConfirmations, dbBytes?)` | Accepts “main”/“test”; constructs a concrete gRPC-Web client internally and restores/creates MemoryWalletDb. Actual constructor has two confirmation arguments although older examples show one. |
| `create_account(name, seedPhrase, hdIndex, birthday?) -> Promise<u32>` | Creates/imports wallet account state. |
| `create_account_ufvk(name, ufvk, seedFingerprint, hdIndex, birthday?)` | Imports an account with spending-purpose derivation metadata; does not thereby receive a spending key. |
| `create_account_view_ufvk(name, ufvk, birthday?)` | Explicit view-only import. Wallet database ID and HD derivation index are different concepts. |
| `sync() -> Promise<void>` | Starts a wasm_thread worker and joins it; underlying sync takes a wallet DB write lock and runs backend sync with MemBlockCache. One call is not a permanent subscription. |
| `get_wallet_summary() -> Promise<WalletSummary?>` | Tip/scanned heights, account balances, pending change and pending spendability, and subtree indices. `account_balances` is a serde-produced JS value. |
| `get_transaction_history(accountId, limit?, offset?)` | Defaults 50/0; exported response wraps JS-valued entries, count and has_more. Entries include txid, signed value, optional fee/height, confirmations, status, memo, pool, timestamp. |
| `get_latest_block() -> Promise<u64>` | Lightwalletd's height, not a fully scanned wallet height. |
| `get_current_address(accountId)`, `get_current_address_transparent(accountId)` | Network-encoded address strings from wallet-managed address state. |
| `db_to_bytes() -> Promise<Uint8Array>` | Snapshot of memory DB under lock; caller must persist it. Binding comment calls it postcard; inner method calls backend `encode` and its comment says protobuf. Treat format as backend-owned, not a specified portable codec. |

[Bindings][W-bind], [inner wallet][W-wallet], [history][W-history], [network enum][W-network], [keys][W-keys]. The birthday-detection helper queries transparent-address history using a hardcoded starting height and a buffer; do not use it as a complete shielded birthday-discovery mechanism.

### Transaction creation and PCZT

`propose_transfer(accountId, toAddress, value)` returns an opaque `Proposal` without signing/proving/submitting. Inner code uses a greedy input selector, ZIP317 fee rule, Orchard change strategy and note-splitting policy. Those are this implementation's choices, not proposed Ironwood defaults. **The Proposal comment promises `describe()`, but its binding file exposes no such method.** A reviewable proposal must be a real API, not a comment. [Proposal][W-proposal], [planning code][W-wallet].

`create_proposed_transactions(proposal, seedPhrase, hdIndex)` combines proving and authorization in a worker, stores transactions, and returns **concatenated 32-byte txids**. `send_authorized_transactions(flattenedTxids)` retrieves stored transactions and sends them sequentially via lightwalletd. A nonzero response error_code becomes `SendFailed { code, reason }`; earlier transactions can already have been submitted if a later one fails. Return type is void. No per-item durable submission report is returned. Inner Rust `transfer(...)` combines proposal/build/send, with a TODO for approval, but is not a corresponding exported WebWallet method. [Bindings][W-bind], [inner methods][W-wallet].

The exported PCZT route is:

```ts
wallet.pczt_create(accountId, toAddress, value) // -> Pczt
// Also wallet.pczt_shield(accountId) -> Pczt
pczt_sign(network, pczt, usk, seedFingerprint) // keys crate -> Pczt
wallet.pczt_prove(pczt, saplingProofGenerationKey?) // -> Pczt
wallet.pczt_combine(pczts) // -> Pczt
wallet.pczt_send(pczt) // -> void
```

`pczt_create` creates a proposal internally; it does not accept the earlier Proposal object for exact continuation. It can auto-sync when its wallet-height lag check exceeds 10; unsynced state errors. `pczt_prove` adds Orchard/Sapling proofs and optionally injects Sapling proof-generation material. A comment claiming that material can be derived from UFVK must not be promoted to a key-authority guarantee: the reviewed keys API exposes `UnifiedSpendingKey.to_sapling_proof_generation_key()`. [Bindings][W-bind], [keys][W-keys], [implementation][W-wallet].

`pczt_send` checks wallet lag, extracts and stores a finalized transaction from PCZT using verification keys, then sends it. The 100-block check and the adjacent “network only accepts anchors” comment are **local heuristics/comments, not verified protocol facts**. It checks wallet height, not a demonstrated universal transaction-validity condition. Name extraction/finalization and broadcast separately in a new API. [Implementation][W-wallet].

`Pczt.serialize()/from_bytes()` wrap backend serialization/parsing; `to_json()/from_json()` use serde. Parsing uses unwrap paths, so malformed data can trap rather than produce a stable typed parse error. Exported `pczt_sign` lives in the keys crate and selects signing targets from derivation metadata/seed fingerprint; this is useful evidence for an external-authority boundary, not a complete policy or signer compatibility guarantee. [PCZT wrapper][W-pczt], [signer][W-sign].

The requests crate separately exposes `TransactionRequest(payments)`, `empty()`, `from_uri()`, `to_uri()`, `payment_requests()`, `total()`, and `PaymentRequest(recipient, amount, memo?, label?, message?, otherParams)` plus `simple_payment`. Its request means a ZIP321 payment request, not a prepared transaction. The reviewed wallet transfer/PCZT-create bindings accept a single recipient/value, not that request object. Avoid conflating these meanings or assuming the wallet supports every request-crate capability. [Requests][W-requests].

### Browser, workers, synchronization and storage

The React provider lazily initializes wallet/keys WASM, calls `initThreadPool(navigator.hardwareConcurrency || 4)`, reads `idb-keyval.get('wallet')`, and restores WebWallet. On incompatible saved state it reports a toast and constructs a fresh wallet for resync. Development serving sets COOP `same-origin` and COEP `require-corp`. These are concrete deployment concerns; “works in browser” must specify worker/WASM initialization, resource loading, isolation requirements and fallback behavior. [React context][W-context], [server][W-server].

`sync` and traditional transaction creation explicitly spawn workers and assert invocation outside a worker. **An async function is not proof of off-main-thread execution:** the exported PCZT prove route directly awaits inner code with synchronous proof calls; no matching worker-spawn boundary is visible there. Do not assume every expensive PCZT stage is off-thread because the legacy path is. Backend parallelism is a separate concern. [Bindings][W-bind], [proving][W-wallet].

The app `usePCZT` flow is create → sign in Snap → prove → send → flush DB → refresh. Status labels represent stages, not measured progress. The Snap receives serialized hex plus caller-supplied display fields; its confirmation displays those fields, then parses/signs PCZT. It hardcodes mainnet and account 0. The boundary keeps seed derivation in the Snap, but this handler does not independently derive displayed recipient/amount from the signed artifact. A new signer must bind approval to decoded content and network/account policy. [App PCZT hook][W-hook], [Snap signing handler][W-snap].

`flushDbToStore` snapshots then writes with idb-keyval; synchronization is retried by app code, guarded against overlap and refreshed against tip/scanned heights. Snapshot storage is outside the Rust memory-wallet operation. In the PCZT flow, persistence occurs **after broadcast**, leaving a crash window that a durable operation design must close. The pending hook inspects only 20 recent wallet-history entries and suppresses queries during sync; it is UI-derived pending state, not a durable network pending handle. [Actions/storage][W-actions], [pending hook][W-pending].

Rust error variants are flattened into JS Error strings, with additional generic errors and panic/unwrap paths. There is no exported uniform AbortSignal, fine-grained proof-progress stream, durable operation resumption or wait-for-receipt API in the reviewed binding. This scoped absence must not be presented as a complete map of WebZjs or Zakura. [Errors][W-errors], [bindings][W-bind].

## 6. Candidate API shapes

All following code is **hypothetical TypeScript API notation**, not a runnable implementation or backend commitment. Symbols such as Prover, Proposal, FinalizedTransaction and PCZT adapters need Zakura mapping. `request` below is a payment intent with explicit recipient policy; no Ironwood encoding is fabricated:

```ts
const request = {
  account: accountRef,
  payments: [{ recipient: parsedRecipient, amount: 100_000n }],
  receiverPolicy: requiredReceiverPolicy,
};
const waitOptions = { confirmations: 3, timeoutMs: 180_000, signal };
```

Three confirmations is an arbitrary example application policy, not a safety recommendation. Each numbered snippet is an alternative workflow; do not run them consecutively as duplicate payments. Manual examples assume a validated backend supports the illustrated PCZT roles and sign-then-prove ordering. Actual legal stage order/capabilities must be negotiated; proof-free paths skip proof work. A proposal may lead to multiple transactions, so all candidates support batches and per-transaction outcomes.

### A. Functional actions and scalar transaction identifiers

Small immutable data artifacts; stateless actions take an explicit client. Independent public/light/wallet clients; signer and prover passed only where needed. Automatic `send` returns `Promise<readonly TxId[]>` after acknowledged submissions. Failure after dispatch throws an error carrying submitted/unknown per-item records and an operation ID.

```ts
// 1. Simple send-and-wait.
const txids = await send(wallet, { ...request, signer, prover, broadcaster: pub });
const observed = await waitForTransactions(pub, { txids, ...waitOptions });

// 2. Reviewable proposal. Approval is tied to this exact artifact.
const proposal = await proposeTransfer(wallet, { ...request, sync: 'ifNeeded' });
const approval = await reviewAndApprove(proposal.summary, proposal.digest);
const reviewedTxids = await executeProposal(wallet, {
  proposal, approval, signer, prover, broadcaster: pub,
});

// 3. External signer/PCZT. Retain proposal association on import.
const exchange = await exportPczt(wallet, { proposal, approval });
const signedBytes = await externalSigner.signPczt({ bytes: exchange.bytes });
const signed = await importPczt(wallet, { exchange, bytes: signedBytes });

// 4. Manual prove/finalize/broadcast (continues step 3).
const proved = await prove(prover, { artifact: signed, signal, onProgress });
const finalized = await finalize(wallet, { proposal, artifact: proved });
const submissions = await broadcastTransactions(pub, { transactions: finalized });

// 5. Public bytes-only broadcast and observation; no wallet.
const submission = await broadcastTransaction(pub, { transaction: finalizedTx });
const status = await getTransactionStatus(pub, { txid: finalizedTx.txid });
const inclusion = await waitForTransaction(pub, {
  txid: finalizedTx.txid, ...waitOptions,
});
```

**Strength:** explicit dependency flow, good tree-shaking and easily serialized results. **Cost:** the simplest return drops proposal/batch history, pushes restart logic onto applications, and makes “throw after partially successful send” difficult to handle consistently. Returning a scalar array is tolerable for a low-level helper; it is a weak default for long-running wallet sends. A persistence subsystem would still be needed to meet the unknown-outcome contract.

### B. Independent clients plus explicit stages and a durable payment handle — preferred

Use small client interfaces; no public/light client constructor depends on a wallet. The wallet receives services through adapters rather than inheriting public/light methods.

| Proposed surface | Arguments and result contract |
| --- | --- |
| `public.getTransaction` | `{ txid, signal? } -> Promise<PublicTransaction \| null>`; successful absence differs from endpoint failure. |
| `public.getBlock` | `{ hash }` or `{ height }`, plus request options; returns a public block record with identity/provenance. |
| `light.getTip` | `{ signal? } -> Promise<ChainPoint>`; endpoint-reported tip, with verification level made explicit. |
| `light.streamCompactBlocks` | `{ fromHeight, toHeight, signal? } -> AsyncIterable<CompactBlock>` only if the mapped light transport supports it; downloading does not scan an account. |
| `wallet.sync` | `{ target?, signal?, onProgress? } -> Promise<SyncSnapshot>`; finite synchronization to a specified/captured target. A separate `watchSync` would own continuous background work and return a stop function. |
| `wallet.getBalance` | `{ account, atSnapshot? } -> Promise<BalanceSnapshot>` with bigint amounts, spendability categories, scanned chain point and wallet revision; no implicit network synchronization. |
| `wallet.propose` | `{ account, payments, receiverPolicy, sync, ... } -> Promise<Proposal>`; may synchronize only under the requested policy, may reserve inputs if explicitly documented, never authorizes or broadcasts. |

These are capability contracts to map, not assertions that each endpoint or Zakura module exposes these methods. `atSnapshot` must fail explicitly if historical wallet snapshots are unsupported; it cannot silently return current state.

```ts
const pub = createPublicClient({ network, transport: rpcTransport });
const light = createLightClient({ network, transport: compactBlockTransport });
const wallet = await createWalletClient({
  network, store,
  synchronizer: createSynchronizer({ lightClient: light, scanner }),
  planner,
  execution: { signer, prover, broadcaster: pub }, // optional capabilities
});
// An offline/view-only wallet can omit execution and synchronizer.

// 1. Simple send-and-wait.
const pending = await wallet.send({ ...request, signal, onProgress });
const outcome = await pending.wait(waitOptions);

// 2. Reviewable proposal; execute this plan, never secretly reselect.
const proposal = await wallet.propose({ ...request, sync: 'ifNeeded' });
const approval = await reviewAndApprove(proposal.summary, proposal.digest);
const reviewed = await wallet.execute({ proposal, approval, signal, onProgress });

// 3. External signer/PCZT.
const exchange = await wallet.exportPczt({ proposal, approval });
const signedBytes = await externalSigner.signPczt({
  bytes: exchange.bytes, network,
});
const signed = await wallet.importPczt({ exchange, bytes: signedBytes });

// 4. Manual prove/finalize/broadcast (continues step 3).
const proved = await prover.prove({ artifact: signed, signal, onProgress });
const finalized = await wallet.finalize({ proposal, artifact: proved });
const manualPending = await wallet.track({ proposal, transactions: finalized });
const report = await manualPending.broadcast({ publicClient: pub, signal });
// track commits recovery records/bytes before any network dispatch.

// 5. Public broadcast/observation, entirely independent of wallet.
const submission = await pub.broadcastTransaction({ transaction: finalizedTx, signal });
const observer = pub.observeTransaction({ txid: finalizedTx.txid });
const inclusion = await observer.wait(waitOptions);
// Observer needs only network + txid; no private proposal or store.
```

Here `await wallet.send` completes automatic planning/authorization/proving/finalization and a broadcast attempt, **not mining**. It persists an operation before work, emits its ID early through progress, and returns a handle after acknowledged, rejected, or unknown submission outcomes. Pre-submission failure throws a stage error with the persisted operation ID when one exists. `execute` has the same return semantics but requires an already approved proposal. A failed storage commit prevents dispatch. Automatic mode uses a configured bounded freshness policy and the signer's approval policy; it must not silently convert external user approval into blanket authorization. The manual `propose` path makes freshness choice visible at the call site.

The handle is not a Promise-like transaction that magically changes identity. Proposed minimal contract:

```ts
interface PendingPayment {
  readonly operationId: OperationId; // local identity, never an on-chain txid
  readonly network: NetworkRef;
  snapshot(): Promise<PaymentSnapshot>;
  wait(options: WaitOptions): Promise<PaymentObservation>;
  events(options?: { signal?: AbortSignal }): AsyncIterable<PaymentEvent>;
  broadcast(options: BroadcastOptions): Promise<BatchBroadcastReport>;
}
// Rebind behavior after a restart; function closures are never persisted.
const resumed = await wallet.resume({ operationId: savedId });
```

`PaymentSnapshot` stores per-stage status and per-transaction txids when available, plus separate submission and chain observations. A rejected item is preserved in the snapshot; `wait` rejects with a structured batch error for a known terminal failure, rather than waiting forever. Unknown submissions remain observable by txid. Partial batch results survive either outcome.

**Strength:** terse default flow, consistent manual artifacts, restartability, no forced signer-provider coupling. **Cost:** requires a real operation journal and carefully specified ownership, migrations and concurrency; “durable” must not be promised before storage/backend support is proven. A memory-only store must label handles as ephemeral. If Zakura cannot support stable artifact persistence, expose an explicitly non-durable MVP and revisit the recommendation rather than pretending to resume.

### C. Wallet session and transaction workflow objects

Independent public/light clients remain, but a wallet session creates stateful workflow objects. Fluent discoverability follows ethers' object-oriented ergonomics. Unlike ethers' mined/pending TransactionResponse, this object exists before txids.

```ts
const session = await WalletSession.open({
  network, store, syncSource: light, signer, prover,
});

// 1. Simple send-and-wait.
const flow = await session.send(request, { broadcaster: pub, onProgress });
const outcome = await flow.wait(waitOptions);

// 2. Reviewable proposal.
const draft = await session.propose(request);
const approval = await reviewAndApprove(await draft.describe(), draft.digest);
const approved = await draft.approve(approval);

// 3. External signer/PCZT.
const exchange = await approved.exportPczt();
const bytes = await externalSigner.signPczt({ bytes: exchange.bytes });
const authorized = await approved.importPczt({ exchange, bytes });

// 4. Manual prove/finalize/broadcast (continues step 3).
const proved = await authorized.prove({ prover, signal, onProgress });
const finalized = await proved.finalize();
const pending = await finalized.broadcast({ publicClient: pub });
const restored = await session.resume({ operationId: pending.operationId });

// 5. Independent public transaction object.
const response = await pub.broadcastTransaction({ transaction: finalizedTx });
const observation = pub.transaction({ txid: finalizedTx.txid });
const inclusion = await observation.wait(waitOptions);
```

Each stage returns a new capability-limited object; it must not silently mutate a reviewed proposal. **Strength:** excellent editor discovery and a natural place for stage methods. **Cost:** more object identities and hidden session dependencies, harder worker/serialization boundaries, risk of retaining keys/stale chain state in closures. Users can mistake an early workflow object for an already-broadcast transaction. Persistence still requires plain records beneath the objects. This is viable as an optional facade over B, but would be a heavier initial core.

## 7. Recommended lifecycle and return contract

Choose **B provisionally**. The important choice is not factory versus class syntax; it is making wallet planning and durable execution distinct from public transport.

| Return option for high-level send | Assessment |
| --- | --- |
| Bare txid | Good for one finalized transaction; cannot describe preparation, partial batch submission or restartable work. |
| viem-like Hash | Same limitations as txid, plus Ethereum-centric naming/encoding temptation. |
| ethers-like response | Convenient hash + wait + fetch behavior, but provider-bound object identity is not durable storage and normally starts after submission. |
| Durable Zcash pending handle | Best fits potentially long wallet work, external signing, multiple transaction steps and uncertain submission. Requires explicit operation ID versus txid distinction and genuine persistence. |

For **public raw broadcast**, propose `Promise<BroadcastReport>`, a plain result with known txid and a discriminant `acknowledged | rejected | unknown`, endpoint provenance and optional diagnostic code. Validation errors before dispatch still throw. An acknowledgment means that endpoint accepted the submission request, not consensus inclusion or universal mempool acceptance. A public observer can attach `wait` convenience without acquiring wallet authority. A separately named `broadcastTransactionId` adapter could return only an acknowledged txid for callers deliberately choosing that weaker contract.

For **wallet send**, return the durable handle after the attempt, with a journaled ID available through progress earlier. Keep an optional `startSend`/enqueue API out of the initial surface unless applications need a handle immediately: overloading `send` to mean both “queued locally” and “submitted” invites mistakes.

The intended lifecycle, subject to backend mapping:

1. Validate payment intent, network, account and available capabilities. Automatic mode may sync under an explicit policy; manual mode can require a caller-provided scan snapshot.
2. Build a proposal with selected inputs, recipients/receiver choices, change, fee, dependencies, target context, wallet revision and whatever validity information the backend actually supplies. Quote freshness and reserve inputs under explicit rules; proposal creation is not secretly signing.
3. Bind approval to an immutable canonical representation/digest. Revalidation may reject a stale proposal; it must not silently change selected inputs, fees or privacy routing after review. A changed plan requires new approval.
4. Export/import artifacts for supported PCZT roles; check network, original proposal association, expected signer contributions and permitted mutations. PCZT import is not approval. Do not promise arbitrary sign/prove ordering, merge semantics or Ironwood support before mapping them.
5. Authorize/prove in supported order, finalize and persist exact finalized bytes plus operation/txid association before dispatch. Finalization does not broadcast.
6. Record each broadcast attempt. On timeout/disconnect after dispatch, mark unknown and query the same txid. Explicit rebroadcast retries the **same bytes**; never rebuild/reselect/resign automatically to recover from an unknown outcome. Broadcast fallback must preserve this rule.
7. Observe inclusion by block hash and height, confirmation threshold and evidence source. Continue watching can report loss of inclusion; an earlier resolved wait remains a historical snapshot. Wallet scanning separately reconciles spent/received state.

Persistence must define atomic transitions, per-account input reservations, proposal expiry/revalidation, batch dependency order, leases or single-writer rules across tabs/workers, recovery after signer/prover interruption, and migrations. Retain enough private material to resume only with explicit storage protection and lifetime policy; never put secrets into a public observer token. Reorgs may invalidate wallet plans; the backend must tell the library how to roll back/reconcile reservations.

A proposed `getTransaction({ txid }) -> Transaction | null` uses null for a successful “not found” lookup and errors for unavailable/unsupported sources. A separate `getTransactionStatus` reports evidence such as not-seen, observed pending, or included only when supported by the selected endpoint. Absence at one endpoint is not global absence. Avoid the Ethereum name “receipt” for Zcash unless defined as a library observation record with no implied EVM execution status/logs.

## 8. Validation and remaining questions

Validation used only first-party repositories/documentation plus local source. Immutable file links below were fetched through the GitHub connector; local WebZjs paths and relevant symbols were inspected. Source locations are pinned by full commits, not unstable line numbers. Live release API records were checked. Browser document retrieval failures and the stale cached release discrepancy are recorded above; they were resolved through official repository/API reads. No runtime, network transaction, proving, or generated-declaration compatibility tests were performed; the candidate examples are intentionally unimplemented sketches.

Validation passed: all 53 immutable file references resolve to inspected source files, all Markdown source-reference labels are defined, and `git diff --check` plus `git diff --no-index --check /dev/null REVIEW.md` report no whitespace errors. The no-index check includes this untracked new document. Link validation confirms retrieval and source identity, not that mutable documentation will remain unchanged.

Unresolved questions for the **Zakura symbol map**:

- Which symbols separately support transparent, Sapling and Ironwood planning, fee calculation, input/note selection, authorization, proving, finalization, raw transaction encoding and txid calculation? Which operations mutate wallet state?
- Does Ironwood support a PCZT representation and external signer roles in this backend? Which artifact versions, proof materials, legal stage orders and verification functions exist?
- Can a proposal be inspected, serialized, cryptographically bound to approval and resumed across wallet revisions? Are multiple dependent transactions possible, and how are their fees/dependencies represented?
- What exact sync checkpoints, reorg/rewind semantics, note reservations and database transactions are available? Can durable operation records share an atomic commit with wallet updates?
- Which public and light transports actually expose submission, transaction lookup, pending visibility, canonical inclusion and conflict evidence? What trust/provenance can each observation honestly report?
- What are the browser worker, cancellation, progress and proving-resource interfaces? Can independent clients avoid loading wallet/prover WASM? Which storage formats/migrations and multi-tab ownership rules can be supported?
- How will external signers independently render and approve recipients, amount, fee, change and privacy policy? What runtime account/network/capability negotiation is available?

**Findings:** retain named arguments, independent clients, explicit transport injection and sign/broadcast separation. Make proposals, wallet freshness and proof work first-class. Prefer a durable payment handle over a bare hash for automatic sends, and plain submission reports plus optional observers for public broadcast. Do not inherit Ethereum replacement/finality assumptions, WebZjs naming accidents, or unverified Ironwood capabilities.

## Source index

All V/E/W file references below are first-party source at the revisions recorded above.

- viem: [client factory][V-client], [transaction preparation][V-prepare], [send][V-send], [receipt waiter][V-wait], [official client guide][V-doc-public].
- ethers: [provider/transaction interfaces][E-provider], [signer orchestration][E-signer], [RPC signer][E-jsonrpc], [provider implementation][E-abstract].
- WebZjs: [exported wallet bindings][W-bind], [inner transaction implementation][W-wallet], [PCZT wrapper][W-pczt], [browser flow][W-hook], [Snap signer][W-snap].

[V-package]: https://github.com/wevm/viem/blob/3db6cdf15969e6b2ff9a2899e2ba65b6f90460f2/src/package.json
[V-client]: https://github.com/wevm/viem/blob/3db6cdf15969e6b2ff9a2899e2ba65b6f90460f2/src/clients/createClient.ts
[V-public]: https://github.com/wevm/viem/blob/3db6cdf15969e6b2ff9a2899e2ba65b6f90460f2/src/clients/createPublicClient.ts
[V-wallet]: https://github.com/wevm/viem/blob/3db6cdf15969e6b2ff9a2899e2ba65b6f90460f2/src/clients/createWalletClient.ts
[V-http]: https://github.com/wevm/viem/blob/3db6cdf15969e6b2ff9a2899e2ba65b6f90460f2/src/clients/transports/http.ts
[V-custom]: https://github.com/wevm/viem/blob/3db6cdf15969e6b2ff9a2899e2ba65b6f90460f2/src/clients/transports/custom.ts
[V-fallback]: https://github.com/wevm/viem/blob/3db6cdf15969e6b2ff9a2899e2ba65b6f90460f2/src/clients/transports/fallback.ts
[V-accounts]: https://github.com/wevm/viem/blob/3db6cdf15969e6b2ff9a2899e2ba65b6f90460f2/src/accounts/types.ts
[V-send]: https://github.com/wevm/viem/blob/3db6cdf15969e6b2ff9a2899e2ba65b6f90460f2/src/actions/wallet/sendTransaction.ts
[V-balance]: https://github.com/wevm/viem/blob/3db6cdf15969e6b2ff9a2899e2ba65b6f90460f2/src/actions/public/getBalance.ts
[V-receipt]: https://github.com/wevm/viem/blob/3db6cdf15969e6b2ff9a2899e2ba65b6f90460f2/src/actions/public/getTransactionReceipt.ts
[V-read]: https://github.com/wevm/viem/blob/3db6cdf15969e6b2ff9a2899e2ba65b6f90460f2/src/actions/public/readContract.ts
[V-simulate]: https://github.com/wevm/viem/blob/3db6cdf15969e6b2ff9a2899e2ba65b6f90460f2/src/actions/public/simulateContract.ts
[V-prepare]: https://github.com/wevm/viem/blob/3db6cdf15969e6b2ff9a2899e2ba65b6f90460f2/src/actions/wallet/prepareTransactionRequest.ts
[V-estimate]: https://github.com/wevm/viem/blob/3db6cdf15969e6b2ff9a2899e2ba65b6f90460f2/src/actions/public/estimateGas.ts
[V-sign]: https://github.com/wevm/viem/blob/3db6cdf15969e6b2ff9a2899e2ba65b6f90460f2/src/actions/wallet/signTransaction.ts
[V-raw]: https://github.com/wevm/viem/blob/3db6cdf15969e6b2ff9a2899e2ba65b6f90460f2/src/actions/wallet/sendRawTransaction.ts
[V-syncsend]: https://github.com/wevm/viem/blob/3db6cdf15969e6b2ff9a2899e2ba65b6f90460f2/src/actions/wallet/sendTransactionSync.ts
[V-wait]: https://github.com/wevm/viem/blob/3db6cdf15969e6b2ff9a2899e2ba65b6f90460f2/src/actions/public/waitForTransactionReceipt.ts
[V-chain]: https://github.com/wevm/viem/blob/3db6cdf15969e6b2ff9a2899e2ba65b6f90460f2/src/types/chain.ts
[V-errors]: https://github.com/wevm/viem/blob/3db6cdf15969e6b2ff9a2899e2ba65b6f90460f2/src/errors/base.ts
[V-doc-public]: https://github.com/wevm/viem/blob/3db6cdf15969e6b2ff9a2899e2ba65b6f90460f2/site/pages/docs/clients/public.md
[V-doc-custom]: https://github.com/wevm/viem/blob/3db6cdf15969e6b2ff9a2899e2ba65b6f90460f2/site/pages/docs/clients/custom.md
[V-doc-prepare]: https://github.com/wevm/viem/blob/3db6cdf15969e6b2ff9a2899e2ba65b6f90460f2/site/pages/docs/actions/wallet/prepareTransactionRequest.md
[E-package]: https://github.com/ethers-io/ethers.js/blob/3ea4c226dd0b3a074abf90748de9d11192027f4f/package.json
[E-jsonrpc]: https://github.com/ethers-io/ethers.js/blob/3ea4c226dd0b3a074abf90748de9d11192027f4f/src.ts/providers/provider-jsonrpc.ts
[E-browser]: https://github.com/ethers-io/ethers.js/blob/3ea4c226dd0b3a074abf90748de9d11192027f4f/src.ts/providers/provider-browser.ts
[E-signer]: https://github.com/ethers-io/ethers.js/blob/3ea4c226dd0b3a074abf90748de9d11192027f4f/src.ts/providers/abstract-signer.ts
[E-wallet]: https://github.com/ethers-io/ethers.js/blob/3ea4c226dd0b3a074abf90748de9d11192027f4f/src.ts/wallet/base-wallet.ts
[E-provider]: https://github.com/ethers-io/ethers.js/blob/3ea4c226dd0b3a074abf90748de9d11192027f4f/src.ts/providers/provider.ts
[E-abstract]: https://github.com/ethers-io/ethers.js/blob/3ea4c226dd0b3a074abf90748de9d11192027f4f/src.ts/providers/abstract-provider.ts
[E-network]: https://github.com/ethers-io/ethers.js/blob/3ea4c226dd0b3a074abf90748de9d11192027f4f/src.ts/providers/network.ts
[E-errors]: https://github.com/ethers-io/ethers.js/blob/3ea4c226dd0b3a074abf90748de9d11192027f4f/src.ts/utils/errors.ts
[W-manifest]: https://github.com/ChainSafe/WebZjs/blob/a50df944c32243cb8da9f86e7d52cb65ac926439/crates/webzjs-wallet/Cargo.toml
[W-app-package]: https://github.com/ChainSafe/WebZjs/blob/a50df944c32243cb8da9f86e7d52cb65ac926439/packages/web-wallet/package.json
[W-cargo]: https://github.com/ChainSafe/WebZjs/blob/a50df944c32243cb8da9f86e7d52cb65ac926439/Cargo.toml
[W-lock]: https://github.com/ChainSafe/WebZjs/blob/a50df944c32243cb8da9f86e7d52cb65ac926439/Cargo.lock
[W-bind]: https://github.com/ChainSafe/WebZjs/blob/a50df944c32243cb8da9f86e7d52cb65ac926439/crates/webzjs-wallet/src/bindgen/wallet.rs
[W-wallet]: https://github.com/ChainSafe/WebZjs/blob/a50df944c32243cb8da9f86e7d52cb65ac926439/crates/webzjs-wallet/src/wallet.rs
[W-history]: https://github.com/ChainSafe/WebZjs/blob/a50df944c32243cb8da9f86e7d52cb65ac926439/crates/webzjs-wallet/src/bindgen/transaction_history.rs
[W-network]: https://github.com/ChainSafe/WebZjs/blob/a50df944c32243cb8da9f86e7d52cb65ac926439/crates/webzjs-common/src/network.rs
[W-keys]: https://github.com/ChainSafe/WebZjs/blob/a50df944c32243cb8da9f86e7d52cb65ac926439/crates/webzjs-keys/src/keys.rs
[W-proposal]: https://github.com/ChainSafe/WebZjs/blob/a50df944c32243cb8da9f86e7d52cb65ac926439/crates/webzjs-wallet/src/bindgen/proposal.rs
[W-pczt]: https://github.com/ChainSafe/WebZjs/blob/a50df944c32243cb8da9f86e7d52cb65ac926439/crates/webzjs-common/src/pczt.rs
[W-sign]: https://github.com/ChainSafe/WebZjs/blob/a50df944c32243cb8da9f86e7d52cb65ac926439/crates/webzjs-keys/src/pczt_sign.rs
[W-requests]: https://github.com/ChainSafe/WebZjs/blob/a50df944c32243cb8da9f86e7d52cb65ac926439/crates/webzjs-requests/src/requests.rs
[W-context]: https://github.com/ChainSafe/WebZjs/blob/a50df944c32243cb8da9f86e7d52cb65ac926439/packages/web-wallet/src/context/WebzjsContext.tsx
[W-server]: https://github.com/ChainSafe/WebZjs/blob/a50df944c32243cb8da9f86e7d52cb65ac926439/packages/web-wallet/server.js
[W-hook]: https://github.com/ChainSafe/WebZjs/blob/a50df944c32243cb8da9f86e7d52cb65ac926439/packages/web-wallet/src/hooks/usePCZT.ts
[W-snap]: https://github.com/ChainSafe/WebZjs/blob/a50df944c32243cb8da9f86e7d52cb65ac926439/packages/snap/src/rpc/signPczt.tsx
[W-actions]: https://github.com/ChainSafe/WebZjs/blob/a50df944c32243cb8da9f86e7d52cb65ac926439/packages/web-wallet/src/hooks/useWebzjsActions.ts
[W-pending]: https://github.com/ChainSafe/WebZjs/blob/a50df944c32243cb8da9f86e7d52cb65ac926439/packages/web-wallet/src/hooks/usePendingTransactions.ts
[W-errors]: https://github.com/ChainSafe/WebZjs/blob/a50df944c32243cb8da9f86e7d52cb65ac926439/crates/webzjs-wallet/src/error.rs

## Sapling v1 acceptance impact

D04/D05 require transparent + Sapling + Ironwood; Sprout remains deferred. Exercise manual and composed send/wait paths for every supported source/destination pool pair, including Sapling shielding, Sapling-to-Sapling and Sapling↔Ironwood, plus mixed inputs, fees/change, persisted scan state, confirmation, unknown submission, expiry and reorg. Validate Sapling proof-generation authority separately from spend authorization and UFVK viewing authority; require parameter acquisition/hash checks/caching/package and worker-memory evidence from the [scope-impact appendix](zakura-api-capability-map.md#sapling-scope-impact-appendix). No runtime result or device support is implied. Default UA generation maps to `UnifiedAddressRequest::AllAvailableKeys`, including/requiring every available supported receiver on the account: transparent, Sapling and the Orchard-encoded receiver used for Ironwood. Publishing this UA links the receivers and permits transparent receipt. Shielded-only remains an explicit supported request; unavailable required receivers fail. Decoded Sprout or legacy Orchard support is never inferred. D16a excludes persistent secret custody and D17 keeps account-index allocation in Zakura.
