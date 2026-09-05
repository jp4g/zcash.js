# Keys, accounts, custody and signer API plan

Research snapshot: 2026-09-04. **Planning only; D18/D21 approve the namespace tree in the authoritative audit; remaining TypeScript signatures and host names below are PRELIMINARY candidates, not implemented exports.** No production code, dependencies, builds or cryptographic tests were added. Direct support below means inspected Rust source, not validated JS/WASM functionality.

Preserve [D01–D13](decision-log.md): transparent + **Sapling + Ironwood**, deferred Sprout, one clean Node/browser contract, additive wrapper crate, Rust-owned Zakura SQLite (bundled SQLite inside WASM with a Node filesystem VFS and browser OPFS VFS, each in a dedicated worker), independently constructible public/light/wallet clients, first-class external signing/PCZT, local proving and deferred remote proving. WASM-first delivery follows refined D07; native/N-API acceleration is future benchmark-triggered work only. See the [host architecture](wasm-host-architecture.md). Use the wallet repository's coherent locked Common **1.0.0** graph; the Common **1.1.0** checkout is supplementary source evidence, not permission to mix versions. D07/D08 govern storage and transport; D16a excludes persistent spending-secret custody and D17 keeps account-index allocation in Zakura.

The [namespace audit](api-namespace-audit.md) governs the approved namespace tree: consolidate onboarding in `wallet.accounts.create/import` alongside list/get/removal/signer attachment. These namespace spellings and D17’s Zakura lifecycle are decided. Advanced helper sketches below retain their evidence value; if exposed, account lifecycle/upgrade helpers use the audit’s accounts placement rather than competing top-level entry points.

**Settled v1 scope (D16/D19/D20):** zcash.js does not generate mnemonics or seeds. Applications use a reputable BIP39 npm package and pass the resulting mnemonic to `wallet.accounts.create({ mnemonic })` or `wallet.accounts.import({ mnemonic, accountIndex, birthday })`. Generation entropy/CSPRNG and mnemonic backup belong to the application and chosen package. V1 wallet imports accept mnemonic or UFVK authority; all raw spending-key export and the less-common imports in the [tracked future issue](future-issues.md) are excluded. Standalone UIVK viewing/address tools do not imply UIVK-only wallet support.

## Recommended boundaries and explicit answers

1. **Model wallet account records separately from signers and wallet storage.** A wallet account identifies viewing authority, network, key components, a database-local ID, birthday, scan/spend-tracking state and address allocation. A signer supplies authorization; a prover owns proof execution. One seed may derive many accounts, one database may track unrelated seeds, and an external signer may authorize several accounts.
2. **Do not accept a mnemonic on `createWalletClient`; mirror Zakura account creation and import on the opened wallet.** `wallet.accounts.create({ mnemonic })` calls `WalletWrite::create_account`, which transactionally chooses the next sequential index and returns a memory-only USK-backed signer. `wallet.accounts.import({ mnemonic, accountIndex, birthday })` calls `import_account_hd`; UFVK import calls `import_account_ufvk`. No separate public keyring or JavaScript account-index ledger is required for the minimal API. An empty wallet and an offline viewing wallet require no signer.
3. **Attach signing authority by verified key correspondence, not by changing a `watchOnly` boolean.** For a UFVK account already retaining spend data, bind a matching local/external signer without copying spending secrets into SQLite. A true `AccountPurpose::ViewOnly` record may lack spending state: attaching authority alone cannot make it spendable. Require an explicit recovery/upgrade plan; no supported in-place purpose-upgrade method was found. Incoming-only authority first needs matching full viewing authority and reconstruction of spentness/history before it can support wallet balances or spending.
4. **Prevent accidental export by construction.** Descriptors contain opaque viewing handles, not enumerable UFVK text; signers expose no mnemonic/private-key property or generic serialization method. V1 exposes no raw spending-key export or export authority (D16). Viewing export is separately explicit because it reveals financial history. These are API misuse defenses, not isolation from malicious code in the same JS realm.

Settled scope follows the decision log; remaining design defaults are collected at the end. They do not settle shipment scope or promise hardware compatibility.

## Source evidence and semantic differences

Local roots were inspected without edits. C = `/tmp/zakura-common`, HEAD `13360888be437f066da5e16242663d1b211c6f87`; W = `/tmp/zakura-wallet-libraries`, HEAD `a9142ee100b3a563b7d9ba7a8e94201d00ad8154`; Z = `/tmp/WebZjs`, HEAD `a50df944c32243cb8da9f86e7d52cb65ac926439`. B/S/P below are W's `librustzcash/zcash_client_backend`, `zcash_client_sqlite`, and `pczt`. See also the [capability map](../research/zakura-api-capability-map.md), [landscape](../research/zakura-common-landscape.md), and [transaction API review](../research/transaction-api-inspiration-review.md).

| Ref | Exact inspected source | Evidence and limit |
| --- | --- | --- |
| K1 | [C `zcash_keys/src/keys.rs`](https://github.com/zakura-core/common/blob/13360888be437f066da5e16242663d1b211c6f87/crates/zcash_keys/src/keys.rs#L237): `UnifiedSpendingKey::from_seed`, `to_unified_full_viewing_key`, `transparent`, `sapling`, `orchard` | Seed/account derivation and authority decomposition. `sapling`, `orchard`, `transparent-inputs` gate components. No mnemonic generation/custody product. W call sites use the pinned 1.0.0 graph; these definitions are 1.1.0. |
| K2 | [same file, USK codec](https://github.com/zakura-core/common/blob/13360888be437f066da5e16242663d1b211c6f87/crates/zcash_keys/src/keys.rs#L310), `Era`, `to_bytes`, `from_bytes` | `unstable` binary encoding for wallet storage/FFI; explicitly not a user-facing string standard, no checksum. `Era::Orchard` names a key era, not transaction pool identity. |
| K3 | [same file, UFVK/UIVK](https://github.com/zakura-core/common/blob/13360888be437f066da5e16242663d1b211c6f87/crates/zcash_keys/src/keys.rs#L979): `decode/encode`, `to_unified_incoming_viewing_key`, `subsumes_uivk/subsumes_ufvk`, UIVK `decode/encode/subsumes` at 1376 onward | Viewing codecs and component containment. No spending-key recovery from viewing keys. UFVK outgoing recovery is constrained by the sender's OVK policy and available transaction data. |
| K4 | [same file, address generation](https://github.com/zakura-core/common/blob/13360888be437f066da5e16242663d1b211c6f87/crates/zcash_keys/src/keys.rs#L1591): UIVK `address/find_address/default_address`, UFVK delegates; `ReceiverRequirement`, `UnifiedAddressRequest` | Requires a shielded UA receiver; transparent child index restriction is checked. `find_address` advances for invalid Sapling diversifiers, not arbitrary failure. Orchard address-at-index has no Sapling-style rejection search. |
| K5 | [C `address.rs`](https://github.com/zakura-core/common/blob/13360888be437f066da5e16242663d1b211c6f87/crates/zcash_keys/src/address.rs#L447): `Address::can_receive_as`; [Orchard keys](https://github.com/zakura-core/common/blob/13360888be437f066da5e16242663d1b211c6f87/crates/orchard/src/keys.rs#L73): `SpendingKey::{from_bytes,to_bytes,from_zip32_seed}` | Ironwood uses the Orchard receiver and key structure. Raw 32-byte Orchard spending-key codec exists; this does not provide transparent authority or a new Ironwood wire encoding. |
| W1 | [B `data_api.rs:614`](https://github.com/zakura-core/wallet-libraries/blob/a9142ee100b3a563b7d9ba7a8e94201d00ad8154/librustzcash/zcash_client_backend/src/data_api.rs#L614): `AccountPurpose`, `AccountSource`, `Account` | Spending-purpose means tracking required spending information, not possessing a secret. UFVK permits balance tracking; incoming-only cannot determine shielded spends and balance-dependent APIs must error. Account authority must cover all tracked outputs or none; avoid partial-key imports that overstate authority. |
| W2 | [B `data_api.rs:3368`](https://github.com/zakura-core/wallet-libraries/blob/a9142ee100b3a563b7d9ba7a8e94201d00ad8154/librustzcash/zcash_client_backend/src/data_api.rs#L3368): `AccountBirthday::{from_parts,from_treestate,height,recover_until}` | Birthday is first scanned block; supplied chain state is the prior block. Recovery boundary is exclusive. Chain state/frontiers must match network and height, including Sapling and Ironwood. |
| W3 | [B `data_api.rs:3669`](https://github.com/zakura-core/wallet-libraries/blob/a9142ee100b3a563b7d9ba7a8e94201d00ad8154/librustzcash/zcash_client_backend/src/data_api.rs#L3669): `WalletWrite::{create_account,import_account_hd,import_account_ufvk,delete_account}`; [S implementation](https://github.com/zakura-core/wallet-libraries/blob/a9142ee100b3a563b7d9ba7a8e94201d00ad8154/librustzcash/zcash_client_sqlite/src/lib.rs#L2111) | Creation selects next index for a seed; import accepts an exact index. Returns USK to caller and stores viewing/provenance metadata. DB UUID is not ZIP32 index. The “256-byte” argument prose conflicts with checked 32–252-byte bounds; use validated bounds, not that typo. |
| W4 | [S `wallet.rs:454`](https://github.com/zakura-core/wallet-libraries/blob/a9142ee100b3a563b7d9ba7a8e94201d00ad8154/librustzcash/zcash_client_sqlite/src/wallet.rs#L454), `add_account`; [upgrade helpers at 1811](https://github.com/zakura-core/wallet-libraries/blob/a9142ee100b3a563b7d9ba7a8e94201d00ad8154/librustzcash/zcash_client_sqlite/src/wallet.rs#L1811); [collision tests](https://github.com/zakura-core/wallet-libraries/blob/a9142ee100b3a563b7d9ba7a8e94201d00ad8154/librustzcash/zcash_client_sqlite/src/lib.rs#L4451) | Collisions check IVK components. Internal `upgrade_account_ufvk` accepts strictly added, subsuming viewing capability and updates key/cache columns; it does not update `has_spend_key`, source, birthday or rescan state. Equal-key reimport collides. Internal Incoming representation exists; no public `WalletWrite::import_account_uivk` was found. |
| W5 | [B address writes](https://github.com/zakura-core/wallet-libraries/blob/a9142ee100b3a563b7d9ba7a8e94201d00ad8154/librustzcash/zcash_client_backend/src/data_api.rs#L3846): `get_next_available_address`, `get_address_for_index`; `WalletRead::{list_addresses,get_last_generated_address_matching,get_account_ids,get_account}` | UA allocation persists and marks exposure; changing receivers at an exposed index should fail. Arbitrary transparent indices can defeat seed recovery gap limits. Transparent LL gap-generation/exposure primitives exist, but a complete transparent-only account/allocation composition needs validation. |
| P1 | [P signer](https://github.com/zakura-core/wallet-libraries/blob/a9142ee100b3a563b7d9ba7a8e94201d00ad8154/librustzcash/pczt/src/roles/signer/mod.rs#L463): `Signer::sign_sapling`, `sign_ironwood`, `sign_transparent`; [redactor](https://github.com/zakura-core/wallet-libraries/blob/a9142ee100b3a563b7d9ba7a8e94201d00ad8154/librustzcash/pczt/src/roles/redactor/orchard.rs#L13): `redact_ironwood_with`; prover/extractor roles | Actual Sapling and Ironwood role paths exist; see the [Sapling appendix](../research/zakura-api-capability-map.md#sapling-scope-impact-appendix). End-to-end interoperability, role-specific redaction, device review and hardware support remain unverified. Existing map documents conditional proof/sign order and single-step proposal-to-PCZT restriction. |
| Z1 | [Z keys](https://github.com/ChainSafe/WebZjs/blob/a50df944c32243cb8da9f86e7d52cb65ac926439/crates/webzjs-keys/src/keys.rs), [wallet](https://github.com/ChainSafe/WebZjs/blob/a50df944c32243cb8da9f86e7d52cb65ac926439/crates/webzjs-wallet/src/wallet.rs), [PCZT signer](https://github.com/ChainSafe/WebZjs/blob/a50df944c32243cb8da9f86e7d52cb65ac926439/crates/webzjs-keys/src/pczt_sign.rs) | Mnemonic account helper, UFVK import and Snap signing separation are useful prior art. Generator source warns it is test-only because browser randomness may be insecure; this is a source warning, not a measured RNG flaw. Wallet helper uses an empty BIP39 passphrase and wipes one seed buffer before wrapping a copy. PCZT routing uses seed fingerprints/paths; zcash.js must additionally verify actual keys and every authorized input. No WebZjs compatibility or Ironwood/device guarantee. |

Official semantics checked on the research date:

- [ZIP 32](https://zips.z.cash/zip-0032) specifies seed length 32–252 bytes and at least 256 bits of generation entropy. Shielded account derivation and transparent BIP44 derivation coexist; a database account number and an address index are distinct concepts. For Orchard key structure reused by Ironwood, derive the existing ZIP32 branch; do not invent a pool-specific branch.
- [ZIP 316](https://zips.z.cash/zip-0316) defines unified address/viewing-key containers, network encodings and receiver constraints. Receiver type is separate from this fork's explicit Ironwood transaction routing. A UA needs a shielded receiver; a transparent-only destination uses a transparent address. A UIVK gives incoming viewing authority rather than complete spentness/balance authority. Preserve unknown items during codec interchange; unsupported/deferred items confer no supported wallet capability.
- [ZIP 315, Draft](https://zips.z.cash/zip-0315) recommends 24-word BIP39 generation and permits shorter legacy restoration with a warning. It also addresses deterministic address management and privacy of disclosure. This is historical source guidance: D24 accepts all standard checksum-valid word counts and does not adopt a runtime warning or result for shorter phrases.
- [BIP39](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki) defines checksum/wordlist validation, NFKD normalization, PBKDF2-HMAC-SHA512 with 2048 iterations and 64-byte seed output. A passphrase changes the seed; it is not a database encryption password and there is no “wrong passphrase” checksum.

Ergonomic comparison: viem's [mnemonicToAccount](https://github.com/wevm/viem/blob/main/src/accounts/mnemonicToAccount.ts) composes mnemonic-to-seed and HD account conversion; [toAccount](https://github.com/wevm/viem/blob/main/src/accounts/toAccount.ts) accepts custom signing methods. Borrow named factories, explicit account selection and injected signing behavior. ethers exposes [wallet/HD/encrypted JSON utilities](https://docs.ethers.org/v6/api/wallet/) and [AbstractSigner/VoidSigner](https://docs.ethers.org/v6/api/providers/abstract-signer/). Borrow offline signing and explicit persistence utilities. Do not borrow a single `getAddress()` as account identity, Ethereum paths, nonce/gas/chainId semantics, address-only shielded watch wallets, message/typed-data signing, or provider-bound signers as requirements. A Zcash account has many diversified receivers and tracked outputs; possession of an address cannot scan its shielded history. ethers JSON encryption is not evidence of a Zakura encryption format.

## TypeScript candidates: minimal ergonomic surface

All operations crossing Rust/worker/device boundaries are asynchronous. Types below describe the contract, not chosen package topology or generated bindings. Opaque brands/handles are library-created and validated again at runtime. `Network` is the existing proposed validated network/consensus descriptor; it includes a stable identity, not an Ethereum chain ID.

```ts
type Pool = 'transparent' | 'sapling' | 'ironwood';
type ReceiverType = 'p2pkh' | 'p2sh' | 'sapling' | 'orchard';
type AccountId = string & { readonly __accountId: unique symbol }; // DB scoped UUID
type AccountIndex = number & { readonly __accountIndex: unique symbol }; // 0..2^31-1
type DiversifierIndex = bigint & { readonly __diversifierIndex: unique symbol }; // 0..2^88-1
type SecretInput = Uint8Array; // UTF-8 bytes for application-supplied mnemonic/passphrase
interface Op { signal?: AbortSignal }
interface Disposable { dispose(): Promise<void> }
interface ViewKeyHandle extends Disposable { readonly kind: 'ufvk' | 'uivk' }
interface AccountDescriptor {
  readonly network: Network;
  readonly viewing: ViewKeyHandle;
  readonly components: readonly ReceiverType[];
  readonly enabledPools: readonly Pool[];
  readonly provenance?: {
    accountIndex: AccountIndex;
    // Identifying/linkable metadata, not proof of key possession.
    seedFingerprint?: string; // 32 bytes, lowercase hex
    scheme: 'zip32-and-bip44';
  };
}
interface Keyring extends Disposable { readonly custody: 'memory' }
interface WalletAccount {
  readonly id: AccountId;
  readonly account: AccountDescriptor;
  readonly viewOnly: boolean; // tracking mode, never signer/secret possession
  readonly signerStatus: 'unattached' | 'attached' | 'locked' | 'unavailable';
}
interface Birthday {
  readonly network: Network;
  readonly firstScanHeight: number; // u32, checked
  readonly priorTreeState: Uint8Array; // validated pinned lightwallet TreeState protobuf
  readonly recoverUntilExclusive?: number;
  readonly source: 'checkpoint' | 'light-client';
}

declare function accountFromViewingKey(args: {
  network: Network; format: 'ufvk' | 'uivk'; encoded: string;
  enabledPools: readonly Pool[];
} & Op): Promise<AccountDescriptor>;
declare function createWalletClient(args: {
  network: Network; storage: WalletStorage; light?: LightClient;
} & Op): Promise<WalletClient>;
interface WalletClient {
  accounts: {
    create(args: {
      mnemonic: SecretInput; passphrase?: SecretInput; name?: string;
       enabledPools?: readonly Pool[];
    } & Op): Promise<{ account: WalletAccount; signer: Signer }>;
    import(args: { mnemonic: SecretInput; passphrase?: SecretInput; accountIndex: AccountIndex;
      birthday: Birthday | 'fullScan'; name?: string; enabledPools?: readonly Pool[]
    } & Op): Promise<{ account: WalletAccount; signer: Signer }>;
    import(args: { viewingKey: string; birthday: Birthday | 'fullScan'; name?: string;
      viewOnly?: boolean; // default false; purpose does not imply a spending key
       enabledPools?: readonly Pool[]
    } & Op): Promise<WalletAccount>;
    list(args?: Op): Promise<readonly WalletAccount[]>;
    get(args: { accountId: AccountId } & Op): Promise<WalletAccount | null>;
    remove(args: { accountId: AccountId; acknowledge: 'deletes-local-history' } & Op): Promise<void>;
    attachSigner(args: { accountId: AccountId; signer: Signer } & Op): Promise<SignerBinding>;
    detachSigner(args: { accountId: AccountId } & Op): Promise<void>;
  };
  addresses: {
    // Source current returns an address, not an index tuple; richer DTO remains open.
    current(args: { accountId: AccountId; request?: AddressRequest } & Op): Promise<string | null>;
    list(args: { accountId: AccountId } & Op): Promise<readonly AddressRecord[]>;
    // at is a persistent exposure operation, not a read-only lookup.
    at(args: { accountId: AccountId; index: DiversifierIndex; request?: AddressRequest } & Op): Promise<AddressRecord>;
    next(args: { accountId: AccountId; request?: AddressRequest } & Op): Promise<AddressRecord>;
  };
  close(): Promise<void>;
}
type AddressRequest =
  | { format: 'transparent' } // external P2PKH for minimal generated-address surface
  | { format: 'unified' } // same AllAvailableKeys default as an omitted request
  | { format: 'unified'; sapling: 'require' | 'omit'; ironwood: 'require' | 'omit'; transparent: 'require' | 'omit' | 'allow' };
interface AddressRecord {
  readonly address: string;
  readonly receiverTypes: readonly ReceiverType[];
  readonly intendedPools: readonly Pool[]; // not encoded Ironwood activation evidence
  readonly index: DiversifierIndex;
}
interface SignerBinding extends Disposable {
  readonly accountId: AccountId;
  readonly state: 'ready' | 'recovery-required';
}
```

`enabledPools` is an enforced operational scope, not a cosmetic label. Decoders may retain a source container containing deferred/unknown items for lossless explicit export, but wallet registration must use a validated supported-component viewing projection and preserve the original separately. Account matching covers every component actually registered. Key derivation may produce extra compiled components internally without advertising or scanning them. Verify construction of these projections on the pinned graph; if it cannot safely represent the requested account, reject registration rather than silently scanning/spending a deferred pool or claiming a complete all-pool restore.

`WalletStorage` follows D07, selecting a Node SQLite path or worker-owned OPFS database; it is not a map of secret material. `LightClient`/`Network` are reused client-planning concepts. `accounts.create` omits birthday because it resolves current verified state for a genuinely new account. Both recovery forms require an explicit birthday or `fullScan`. UFVK import directly calls `WalletWrite::import_account_ufvk` with public `viewOnly?: boolean`, default `false`. Omitted/false maps internally to `AccountPurpose::Spending { derivation: None }` and retains spend-supporting state; it does not imply, store or manufacture a spending key or signer. `true` maps to `AccountPurpose::ViewOnly` and may require reconstruction/rescan before later spending. Zakura has no public `import_account_uivk`; UIVK-only account import is excluded from v1 and stays in the [tracked future issue](future-issues.md), without inventing a backend path. Spend-ready tracking is not a promise that funds, witnesses, activation or a connected signer are ready. An imported UIVK descriptor supports standalone address generation/export but wallet import initially returns `INCOMING_ONLY_WALLET_UNSUPPORTED`, rather than advertising an unverified wallet path. `attachSigner` does not import or upgrade a viewing key implicitly. Recommend returning creation/import signers unattached; explicit attachment or per-operation signer injection supplies authorization. The caller owns returned memory signers. Address list DTOs/filters and absence/error translation remain preliminary; `current` never allocates on a miss, and `at` persists exposure at the exact requested index.

All account-taking wallet operations require an explicit ID; do not silently spend from the first account. Proposals pin the actual account set; the approved namespace tree excludes nested account-bound service facades. No implicit cross-account input selection. Do not equate `AccountDescriptor` object identity, fingerprint, receiver address, ZIP32 index or DB UUID.

## Standalone viewing and address API candidates

```ts
interface ViewingApi {
  export(args: { account: AccountDescriptor; format: 'ufvk' | 'uivk';
    acknowledge: 'discloses-viewing-authority' } & Op): Promise<string>;
  toIncoming(args: { account: AccountDescriptor } & Op): Promise<AccountDescriptor>;
}
interface AddressApi {
  derive(args: { account: AccountDescriptor; index: DiversifierIndex;
    request?: AddressRequest } & Op): Promise<AddressRecord>; // stateless, exact index
  find(args: { account: AccountDescriptor; start: DiversifierIndex;
    request?: AddressRequest; maxAttempts: number } & Op): Promise<AddressRecord>;
  decode(args: { network: Network; address: string } & Op): Promise<DecodedAddress>;
  selectReceiver(args: { address: DecodedAddress; pool: Pool;
    context: ConsensusContext } & Op): Promise<SelectedReceiver>;
}
interface DecodedAddress {
  readonly network: Network; readonly encoded: string;
  readonly knownReceivers: readonly ReceiverType[];
  readonly unknownTypecodes: readonly number[];
}
interface ConsensusContext { network: Network; targetHeight: number; branchId: number }
interface SelectedReceiver {
  readonly pool: Pool; readonly type: ReceiverType; readonly bytes: Uint8Array;
}
```

Mnemonic import validates checksum, wordlist and normalization, then derives seed/account authority internally. BIP39 passphrase handling must be explicit; a derived 64-byte seed does not prove the original mnemonic entropy. Mnemonic recovery accepts every checksum-valid standard BIP39 word count: 12/15/18/21/24. Any preference for 24 words is documentation only, with no runtime warning or result field. zcash.js generates no mnemonics or seeds (D19). No generation helper or generation CSPRNG service is exposed by zcash.js. Randomness required for signing/proving and other cryptographic operations still needs runtime validation.

Historical `custody.generateSeed`, `custody.importSpendingKey`, `custody.exportSecret` and export-permit sketches are withdrawn from the active surface. Raw seed/key helper APIs and unstable encodings belong to the [tracked future issue](future-issues.md), not an advanced v1 escape hatch. K2/K5 retain source evidence without promising wallet import or export support.

Transparent-only **addresses** are in scope. A generated P2PKH address can come from an account also containing Sapling and Ironwood viewing components; that is not a transparent-only **key/account**. Importing a pure transparent account-level key and registering it in SQLite is deferred under D20, including WIF/private-key and P2SH/redeem-script imports. Never fabricate an empty shielded component to make a unified container acceptable. P2SH decoding/receiver selection may be supported while arbitrary P2SH signing is unavailable; W3 documents P2PKH-in-P2SH PCZT limitations.

The default address request maps exactly to Zakura’s `UnifiedAddressRequest::AllAvailableKeys`: include/require every available supported receiver on the account (transparent, Sapling and the Orchard-encoded receiver used for Ironwood). Publishing this UA links these receivers and permits transparent receipt. Shielded-only is an explicit supported request, never the default; missing required receivers fail without fallback. Explicit shielded-only uses `sapling: 'require', ironwood: 'require', transparent: 'omit'`, mapped to `UnifiedAddressRequest::custom(Require, Require, Omit)` in Rust's Orchard, Sapling, P2PKH argument order. Callers may explicitly choose transparent `allow` (omit if unavailable) or `require` (fail if unavailable); transparent inclusion changes privacy exposure. For explicit custom requests, restricted accounts must omit unavailable shielded receivers; at least one shielded receiver must be required. The default follows available account keys without requiring absent components. Missing required keys fail instead of silently narrowing the UA. Do not admit Sprout/unknown components into generation or wallet support. A transparent-only destination uses a transparent address, never an invalid transparent-only UA. A decoded Orchard receiver is not evidence of an Ironwood transaction: `selectReceiver` requires an explicit supported pool plus validated target branch/height and never substitutes legacy Orchard or transparent routing. Unknown receivers may be retained for codec round trips only.

Diversifier indices use 88-bit `bigint` in TS, fixed 11-byte little-endian host bytes and decimal strings in JSON recovery manifests. They are not JS numbers or seed/account indices. Transparent child indices fit the non-hardened range and need gap-limit tracking; advanced exact-index requests beyond a recovery-safe range fail unless an explicit durable discovery-range policy is supplied. `derive` has no DB mutation and no address-uniqueness guarantee. `next` commits allocation/exposure before returning; retries after a lost response use an operation ID to recover the same record. `find` returns the actual selected index, supports a bounded search and never wraps. Sapling diversifiers can be invalid: use bounded `find_address` search and return the actual index; exact-index `derive` can fail. Orchard-encoded/Ironwood addresses do not need this rejection search. Validate transparent index compatibility at the selected index and report exhaustion without wrapping. Receive APIs only expose external scope; internal/change/ephemeral scopes belong to transaction allocation, not ordinary receive UI.

For wallet onboarding, D17 governs the facade: `accounts.create({ mnemonic })` delegates next sequential ZIP-32 index selection to `WalletWrite::create_account` and returns the DB account ID with a USK-backed memory signer. Recovery `accounts.import({ mnemonic, accountIndex, birthday })` uses `import_account_hd`; UFVK import uses `import_account_ufvk`. Standalone derivation remains separate; the recovery examples below import explicit indices through Zakura rather than allocating new ones. All enabled Sapling and Ironwood components must match; no JS account-index ledger or persistent spending-secret vault is introduced.

## Additive Rust host operation map

Every name in the Host column is **new wrapper work**, not an existing Zakura export. Host requests use versioned DTOs and opaque handles. D = direct Rust primitive, G = thin host glue/composition around inspected primitives, U = missing/unverified product path (not a thin-glue promise). C 1.1.0-only details must be checked on the selected 1.0.0 graph before implementation. B/S `orchard` includes Ironwood handling; enable keys `sapling`, `transparent-inputs` consistently and PCZT `sapling`/role features explicitly.

| TS candidate and exact result | Candidate additive host operation, inputs → output | Support / authority and state |
| --- | --- | --- |
| `accountFromViewingKey`, `viewing.toIncoming/export` | `view_import({network,format,text,pools}) → ViewHandle`; `view_to_incoming({view}) → ViewHandle`; `view_export({view,format,disclosure}) → UTF8` | D K3 + G network/component validation. Incoming→full rejects. No spending export permits exist in v1. |
| `createWalletClient(...) → Promise<WalletClient>` / `.close()` | `wallet_open({network,storageRef}) → WalletHandle`; `wallet_close({wallet}) → ()` | D `WalletDb::from_connection/for_path`, `init_wallet_db`; G connection/migration/worker ownership. Seed-dependent migrations must explicitly request custody access, not auto-export seeds. |
| `wallet.accounts.create({ mnemonic, ... })` / `.import({ mnemonic, accountIndex, birthday, ... })` | Mnemonic validation/seed boundary → `wallet_account_create_hd` / `wallet_account_import_hd` → account + memory signer | D W3 `WalletWrite::create_account` / `import_account_hd`; G secret handles and DTOs. Zakura allocates only for create; import preserves the exact index and explicit recovery birthday. No required keyring or JS ledger. |
| `wallet.accounts.get({ accountId })` | `wallet_account_get({wallet,accountId}) → AccountDTO or null` | D `WalletRead::get_account` + G session signer status. Missing record is distinct from a storage error. |
| `wallet.addresses.current({ accountId, request })` | `wallet_address_current({wallet,accountId,request}) → address or null` | D W5 `get_last_generated_address_matching`; no allocation and no source index tuple. |
| `wallet.accounts.import({ viewingKey, birthday, viewOnly?, ... }) → Promise<WalletAccount>` | `wallet_account_import({wallet,view,name,birthday,tracking,provenance?}) → AccountDTO` | D W2/W3 `import_account_ufvk`; G maps omitted/false `viewOnly` to `AccountPurpose::Spending { derivation: None }`, true to `AccountPurpose::ViewOnly`. UIVK rejects: no public `import_account_uivk`. Never imply or store USK. Reject unintended component overlap before W4 can silently add viewing capability. |
| `wallet.accounts.list(...) → Promise<readonly WalletAccount[]>` | `wallet_accounts_list({wallet}) → AccountDTO[]` | D `WalletRead::get_account_ids/get_account` + G; signer status comes from session binding, not `has_spend_key`. No automatic viewing strings. |
| `wallet.accounts.attachSigner/detachSigner` | `wallet_bind_signer({wallet,accountId,validatedView,capabilityRevision}) → BindingHandle`; `wallet_unbind_signer({binding}) → ()` | G key matching and registry. Custom/device callbacks JS-side; no seed crossing. U for true view-only spending upgrade. Binding is session authority, not persisted secret. |
| `wallet.addresses.next(...) → Promise<AddressRecord>` | `wallet_address_next({wallet,accountId,request,operationId}) → AddressDTO` | D W5 UA allocation + G idempotency. Transparent projection from allocated UA is composition for mixed accounts; pure transparent allocation needs validated LL gap-generation/exposure composition, U until confirmed. Do not expose internal address reservations as external. |
| `addresses.derive/find/decode/selectReceiver` | `address_derive({view,index11,request})`, `address_find({view,start11,request,budget})`, `address_decode({network,text})`, `address_select({decoded,pool,context}) → Address/ReceiverDTO` | D K4/K5 codecs + G bounds, policy, network/activation validation. Transparent lower-level derivation via `zcash_transparent` dependency needs pinned vectors. |
| Advanced `wallet.addresses.at({accountId,index,request}) → Promise<AddressRecord>` / `.list({accountId}) → Promise<readonly AddressRecord[]>` | `wallet_address_at({wallet,accountId,index11,request})`; `wallet_addresses_list({wallet,accountId})` | D W5 `get_address_for_index/list_addresses`; G recovery range policy and exposure collision translation. |
| Advanced `resolveBirthday({light,firstScanHeight,recoverUntilExclusive?}) → Promise<Birthday>` | JS fetches prior `TreeState`; `birthday_validate({network,firstScanHeight,treeState,recoverUntil}) → BirthdayDTO` | D W2 + G. Fetching is host-owned transport; no ambient Rust networking. Validate prior height/hash/frontier context, record trust source. Offline input uses same validator. |
| Advanced `wallet.accounts.planUpgrade({accountId,fullViewingKey?,signer?}) → Promise<UpgradePlan>` | `wallet_upgrade_inspect({wallet,accountId,newView?,authorityMatch?}) → {mode,needsRescan,earliestHeight,unsupportedReasons}` | G read/containment inspection W4. `wallet.accounts.applyUpgrade({plan}) → Promise<WalletAccount>` / `wallet_upgrade_apply` is U: may need narrowly scoped upstream purpose API and rehydration, not raw SQL from JS. |
| `createCustomSigner(adapter) → Signer`, `.getCapabilities/.getAccount/.authorize` below | JS/device callback, then `signer_validate_account`, `pczt_inspect`, `pczt_validate_authorization`; local path `pczt_authorize_local({signer,pczt,expected}) → PcztHandle` | D P1 roles + G key routing/review/validation. Callback itself host-only. Never validate by fingerprint alone. |
| Advanced `exportSigningRequest({pczt,signer,review}) → Promise<SigningRequest>` / `acceptSigningResult({request,result}) → Promise<PcztHandle>` | `pczt_export_for_signer({pczt,requirements,reviewCommitment}) → envelope`; `pczt_import_authorization({original,result,expected}) → PcztHandle` | D parser/serializer/redactor/verifier/combiner + G minimum-disclosure profiles, strict comparison and durable resume. Profile/device correctness U. |
| Advanced `prove({pczt,prover,context}) → Promise<PcztHandle>` | `pczt_prove_local({pczt,circuit,assets}) → PcztHandle` | D Sapling `create_sapling_proofs` and explicit Ironwood prover roles + G job/asset ownership. Witness/private proving inputs required; spending key not the prover interface. End-to-end flow U. |
| Deferred beyond v1 (D16a): `openPersistedKeyring({store,unlock,exportPolicy}) → Promise<Keyring>` / `custody.lock(...)` | `custody_open_encrypted({storeRef,unlockHandle,policy})`; `custody_lock({keyring})` | U encrypted-envelope/key-management implementation. `host_secret_store_read/write/delete` transfers encrypted records only; G lock registry. Not encrypted SQLite by implication. |
| Advanced `backupWallet({wallet}) → Promise<WalletBackup>` / `restoreWallet({storage,backup}) → Promise<WalletClient>` | `wallet_backup({wallet}) → versioned consistent snapshot + recovery manifest`; `wallet_restore({storage,backup}) → WalletHandle` | U reviewed online-backup/durability/migration product. DB includes viewing data/history, excludes custody secrets. Application-owned secret recovery is separate; no v1 encrypted keyring backup. |
| Advanced `wallet.accounts.remove({accountId,acknowledge:'deletes-local-history'}) → Promise<void>` | `wallet_account_delete({wallet,accountId}) → ()` | D W3 `delete_account` + G binding invalidation/jobs/reservations policy. Does not delete signer, backup or chain history. |
| `.dispose()`, `.close()`, deferred beyond v1 `deletePersistedSecret({keyring,secretId}) → Promise<void>` | `handle_release({kind,id,generation})`, `wallet_close`, `secret_delete({store,keyId})` | G lifecycle; U durable erasure guarantees. Host best-effort zeroization and ciphertext deletion do not prove physical erasure. |

The checked constructors `accountIndex(value: number): AccountIndex` and `diversifierIndex(value: bigint): DiversifierIndex` validate locally (host-only JS checks; Rust revalidates received values). `viewing` and `addresses` name the proposed namespace objects implementing `ViewingApi` and `AddressApi`; namespace construction itself has no Rust operation. The deferred `openPersistedKeyring` candidate's `store` is a ciphertext read/write/delete adapter and `unlock` yields a runtime-owned unlock handle, never an enumerable password property.

`WalletBackup` is a candidate `{ schemaVersion, networkIdentity, databaseBytes, recoveryManifest }`; its encoding, consistent snapshot mechanism and encryption envelope are unverified. `UpgradePlan` is an opaque versioned plan bound to account ID, original key/capability revision and DB revision; it never contains a spending secret. Auxiliary API names in this table are advanced candidates, not promises to include all of them at v1.

## External signer and PCZT contract

```ts
interface SignerCapabilities {
  readonly revision: string;
  readonly networks: readonly string[];
  readonly authorizations: readonly {
    pool: Pool; txVersion: number; branchIds: readonly number[];
    circuitVersions: readonly string[]; // meaningful for Sapling/Ironwood; empty for transparent
    pcztVersions: readonly number[];
    proofState: 'required' | 'not-required' | 'either';
    requiredFields: readonly string[]; // versioned field identifiers, not arbitrary selectors
    review: 'device' | 'application';
  }[];
  readonly accountDiscovery: 'explicit-index' | 'enumeration' | 'imported-only';
  readonly exportableViewing: readonly ('ufvk' | 'uivk')[];
  readonly maxPcztBytes: number;
}
interface Signer {
  getCapabilities(args?: Op): Promise<SignerCapabilities>;
  getAccount(args: { network: Network; selector:
    { kind: 'derived'; accountIndex: AccountIndex } | { kind: 'imported'; keyId: string }
  } & Op): Promise<AccountDescriptor>;
  authorize(args: SigningRequest & Op): Promise<SigningResult>;
}
interface SigningRequest {
  readonly requestId: string;
  readonly pczt: Uint8Array; // versioned serialized PCZT, not WASM handle
  readonly context: ConsensusContext;
  readonly accountIds: readonly AccountId[]; // local routing hints only
  readonly capabilityRevision: string;
  readonly reviewCommitment: string; // versioned commitment to decoded approved intent
}
interface SigningResult {
  readonly requestId: string;
  readonly pczt: Uint8Array;
}
declare function createCustomSigner(adapter: Signer): Signer;
```

Imported account-level signers use the imported selector with an adapter-scoped opaque key ID; they reject derived selectors if they do not hold an HD root. Their `LocalAccount.account` can also be supplied directly for attachment. Do not invent provenance to satisfy this method. Key IDs identify adapter entries, not database accounts or authorization proofs. `createCustomSigner` validates the adapter shape; it cannot certify the device or isolate malicious callback code.

Negotiate **tuples**, not independent boolean pool/version lists that accidentally imply every combination. Intersect runtime build support, network/target branch, requested pools, account authority, signer role/review/field/size requirements and prover availability before secret disclosure or signer prompts. Recheck revision on every authorization after disconnect/reconnect or account changes. Reject unknown/unsupported tuples with structured reasons; shared Orchard key support does not satisfy an Ironwood capability row. `maxPcztBytes` and field requirements affect handoff feasibility. Optional address confirmation/device account verification can be an adapter capability; no Ledger-specific factory is promised without an actual adapter contract.

Account matching compares validated viewing components against the full tracked account scope; fingerprints, names and derivation paths are routing hints. Reject a transparent-only signer as sole authority for an account tracking Sapling or Ironwood funds. Restricted per-pool transaction authorization is only valid when the custody arrangement covers the whole account and the actual selected inputs match the signer. Do not weaken W1's all-or-none account contract. If a device cannot export sufficient viewing authority, require a separately authenticated account enrollment flow or report attachment unsupported; an address match alone cannot prove full coverage. On every result, verify actual signatures against expected input keys and the original artifact.

The generic external signer/PCZT seam remains in v1. Concrete Ledger support is only a documented stub/placeholder and is unsupported until later device, app/firmware, pool, version and display/review qualification. A generic external/air-gapped signer journey is: independently import trusted UFVK/provenance → add a spend-tracking account → propose/build online → inspect PCZT and bind review → negotiate device tuple and disclosure → export minimum required PCZT → device independently decodes recipients, amounts, fees, change, pool/network and authorization commitments → authorize → import/verify/merge → prove/finalize in the allowed order → submit through wallet orchestration. Device transport (USB/HID/BLE/QR/file) and permission prompts belong to adapters/application; no project service is required. Offline transfer uses bytes/envelopes, never handles or a seed. Persist original PCZT, role progress, review identity and request ID for resume; these artifacts are sensitive and need storage policy. No inspected source proves any Ledger model, firmware/app, review display Sapling support or Ironwood-v6 support. D11 establishes the seam, not device shipment.

Reject result changes to recipients, amounts, network/branch, inputs, fees, change ownership or other committed/reviewed fields. A returned `reviewCommitment` would not itself prove device review; validate decoded content and signatures against the retained original. Compare invariant content rather than requiring identical serialized bytes after roles add proofs/signatures. Partial authorization remains explicit; it must not become “signed” if required inputs lack valid authorization. Cancellation may stop waiting but cannot retract signatures already produced; retain the request for reconciliation and never automatically repeat device prompts.

Proving is separate from spend authorization. Sapling and Ironwood proof jobs may contain witnesses, note plaintext/openings and other sensitive data; they are neither public nor simply a UFVK. The prover does not receive mnemonic/USK as a convenience. Sapling spends need proof-generation authority (from `ExpandedSpendingKey::proof_generation_key`), not merely a UFVK; provide only the required material for matched inputs and keep it out of ordinary wallet backups. Validate multi-account routing, redaction and permitted proof/sign order on the pinned graph. Sapling parameter acquisition, hash/length checks, caching, lazy package delivery and worker-memory limits are v1 work, with application-supplied bytes or configured external sources and no project-operated CDN. PCZT role order depends on version and authorization commitments; do not mandate globally sign-before-prove or prove-before-sign. The source's standard proposal-to-PCZT entry point rejects multi-step proposals; expose that limitation instead of silently dropping steps. Remote proving remains deferred; a future prover transport must not be assumed in any example. Binding/finalization signatures and dummy authorization inside role machinery are not authority to spend real wallet inputs.

## Viewing-only attachment and upgrades

| Existing state | Requested operation | Result / required work |
| --- | --- | --- |
| UFVK, `spend-ready`, no attached signer | Attach fully matching signer | G session binding; preserve DB account ID/history. Require scan completeness/witnesses and capability checks before spending. No key reimport required. |
| UFVK, `view-only` | Attach matching signer | Binding may return `recovery-required`; spending remains blocked. No public purpose-change method established. Never set `has_spend_key` via ad hoc JS SQL. |
| UIVK standalone descriptor | Import matching UFVK | D K3 containment check and replace/retain descriptor handles explicitly. This is viewing upgrade, not signing. Wallet import initially begins from UFVK with birthday. |
| Existing DB account with weaker viewing components | Import strictly subsuming UFVK | W4 has direct internal upgrade behavior reached from UFVK import. Wrapper should require explicit upgrade plan so ordinary `accounts.import` cannot broaden tracking accidentally. Must determine rescans/backfills, historical nullifiers and new component discovery. |
| Equal UFVK with changed purpose or HD seed reimport | Attempt implicit upgrade | W4 collision, not purpose update. Fingerprint/index changes do not bypass this. |
| Conflicting/non-subsuming component keys | Attach/import | `ACCOUNT_KEY_MISMATCH` or `ACCOUNT_COLLISION`; never merge unrelated funds or drop old components. |

For a true view-only upgrade, the safe fallback is a separately created spending-purpose wallet restored with matching UFVK, original safe birthday and discovery metadata, then rescan/reconstruct/verify before switching the application to it. Preserve old wallet/backup until validation; labels, outgoing data discarded by OVK policy, unmined transactions and local reservations may not be reconstructible from chain. Do not delete/reimport in the same database as a hidden convenience. An in-place migration is a candidate for a narrow upstream change only after pinned-stack evidence; D01 does not license speculative schema patches.

## Persistence, recovery, backups and lifecycle

**Secrets and encryption (D16a).** V1 uses memory or injected application/external signer custody; SQLite stores viewing/account metadata and history, not seed/USK or a persistent secret vault; standalone UIVK tools do not establish a UIVK-only account import path. The following encrypted-store considerations are deferred beyond v1, not an implementation or acceptance requirement: persisted custody would be a separate explicit encrypted store. zcash.js must own validation of any encryption envelope it writes and never label plaintext storage “encrypted”; the application owns unlock UX, password/device-key acquisition, recovery and deployment policy. A chosen cryptographic implementation must own KDF/AEAD, randomness, authenticated metadata, versioning and corruption checks. Concrete algorithm/KDF budgets, platform key stores and envelope compatibility remain owner/security-review choices, not new dependencies selected here. Encrypt before persistence; host secret-store callbacks receive ciphertext, identifiers and authenticated metadata only. If a key provider must execute cryptography outside Rust, its trust/copy boundary is explicit and separately reviewed.

Wallet database confidentiality is independent: viewing keys, memos, addresses and transaction relations are sensitive even without spend keys. Bundled SQLite, filesystem permissions and OPFS origin access are not by themselves a zcash.js encrypted-at-rest guarantee. Whole-DB encryption, VFS/WAL protection, backups and OS/browser copies require a separate decision/validation. Never accept `encrypted: true` without a verified backend report. Do not add SQLCipher or another dependency in this planning task. Locking a signer may leave an intentionally open viewing wallet scanning; application “lock wallet” must explicitly close viewing handles/database if it intends to hide history.

**Recovery metadata.** Store network identity, key-source reference (no secret), scheme/coin type/account index where known, fingerprint where permitted, per-account firstScanHeight/prior checkpoint/recovery boundary, enabled pools, address receiver policy, exposed diversifier indices and transparent discovery ranges/gap limits. Metadata is versioned and privacy-sensitive. A mnemonic alone does not preserve arbitrary account-index gaps, labels, locally discarded outgoing recovery data or out-of-gap transparent addresses. Birthday is not key derivation input and must not change an account's keys. Never default restored accounts to today's tip; require a safe supplied birthday or an explicit conservative scan start. New-account “now” convenience needs a verified prior chain state and should not be reused for imports. Early birthday may cost scanning; late birthday can omit funds. Transparent history queries are privacy disclosures and cannot discover a general shielded birthday. `recoverUntilExclusive` controls recovery status, not where future scanning stops. Account discovery across indices needs a bounded explicit strategy; never claim derivation enumerates all used accounts.

**Backups.** Separate (a) spending backup: application-held mnemonic plus passphrase requirements or external signer recovery material; (b) viewing backup: UFVK/UIVK with disclosure acknowledgment; (c) consistent DB/recovery metadata backup. Non-derived key imports and their backup formats are deferred under D20. Never include secret exports in a generic wallet snapshot. Applications own spending-secret backup in v1; a library encrypted custody backup is deferred (D16a); a viewing/DB backup also warrants confidentiality protection. Consistent SQLite snapshot must include committed state rather than copying a live database file while ignoring WAL. Restore verifies network, format and compatible schema in isolated storage before replacing anything, reconstructs runtime handles and requests application-held mnemonic reimport or an external signer separately. Seed-dependent migrations may need temporary authority access. Backups and external device recovery procedures are not revoked by deleting the local account.

**Export policy (settled D16).** V1 excludes all raw spending-key export, with no export-enabled keyring, reveal-bytes API or one-time backup exception. Applications back up their independently held mnemonic; zcash.js does not retain a phrase for later export. Viewing export remains explicit. Object inspection, `toString`, `toJSON`, events, traces and errors redact secrets and viewing material; raw foreign errors must not leak as `cause`. Opaque custody is not isolation against same-process memory access, and JS/WASM erasure remains best-effort.

**Workers and object lifetime.** The browser database has one dedicated owner worker and one writer per database. Keyring/signer ownership may be in that worker for ordinary local custody or in a separate custody worker/device for stronger separation; a worker is not a security boundary against code authorized to send it commands. UI→custody import uses transferred byte buffers where possible, then wipes caller buffers best-effort; text inputs and structured clones may already contain copies. Never send spending secrets to the scan/prove worker just to unify APIs. An in-process `ViewKeyHandle` cannot cross WASM instances; transfer a validated viewing encoding through an internal explicit disclosure path or use an owner-worker RPC proxy. Custom signer functions stay in JS and communicate with workers through request IDs; no callbacks stored as persistent database objects.

Handles carry instance ID, kind, generation and lifetime; stale/wrong-instance/disposed use fails. Descriptor handles are shareable by explicit retain/release, not serialized object layout; wallet `accounts.import` copies the required viewing data into DB so closing the original keyring does not erase wallet history. `SignerBinding.dispose` detaches that binding; `wallet.close` detaches its bindings, flushes/ends storage use and invalidates wallet-dependent handles, but does not dispose injected shared keyrings, clients or devices. Keyring lock revokes local authorization handles, clears cached unlocked secret material best-effort and rejects queued authorizations. A future persisted unlock would require its adapter; memory-only custody cannot unlock erased keys without reimport. Finalizers are fallback cleanup only. Close/dispose is idempotent; operations otherwise reject after close.

Serialize DB mutations and avoid awaiting JS/device callbacks while holding mutable Rust borrows or SQLite transactions. Snapshot a request, release locks, invoke external work, then compare DB/artifact revision before commit. Cancellation before a mutation commit rolls that mutation back; an earlier committed operation record remains; cancellation/worker loss after commit is reconciled via operation ID. Proposed idempotency requires host glue and durable journal design, not a property of every Rust call. Worker crash invalidates all handles; reopen DB, reconcile durable operations and reattach/unlock authority explicitly. Do not release uncertain transaction reservations merely because the signer/worker disappeared.

**Deletion and zeroization limits.** Use audited zeroizing containers where supported and minimize secret copies; review every derived key, temporary allocation, serialization and exception path. Some upstream key types may not zeroize on drop; this is unverified until audited on the pinned graph. Rust zeroization cannot erase JS strings, garbage-collected copies, browser form state, devtools, snapshots, swap, crash dumps or a device's copies. `Uint8Array.fill(0)` only wipes that view's accessible buffer; transfer/detach is not proof all historical copies vanished. WASM linear memory may retain freed bytes; terminating a worker removes access but does not prove physical erasure. Database deletion may leave WAL/free pages, filesystem/SSD/browser backups and replication. Encrypted-record deletion plus destroying an independently held key can reduce recoverability, but do not promise cryptographic erasure when key copies remain. Account removal leaves on-chain funds and chain history intact.

Errors must include a stable code, stage, retryability and safe recovery guidance, with no input mnemonic/key/PCZT dump. Candidate codes include `ENTROPY_UNAVAILABLE`, `INVALID_MNEMONIC`, `INVALID_SEED_LENGTH`, `NETWORK_MISMATCH`, `ACCOUNT_KEY_MISMATCH`, `ACCOUNT_COLLISION`, `UNSUPPORTED_KEY_ENCODING`, `INCOMING_ONLY_WALLET_UNSUPPORTED`, `FULL_VIEWING_KEY_REQUIRED`, `RECOVERY_REQUIRED`, `RECEIVER_UNAVAILABLE`, `DIVERSIFIER_EXHAUSTED`, `ADDRESS_SEARCH_LIMIT`, `ADDRESS_ALREADY_EXPOSED`, `DISCOVERY_RANGE_UNSAFE`, `SIGNER_CAPABILITY_MISMATCH`, `SIGNER_REJECTED`, `CUSTODY_LOCKED`, `STALE_HANDLE`, `WRONG_INSTANCE`, `STORAGE_ERROR` and `ABORTED`. Scope errors are not silently retried with a weaker pool/privacy setting.

## Concrete usage candidates

The `network`, `storage`, `light`, `checkpoint` and adapter values below are application-supplied validated objects, not hardcoded deployed Ironwood activation claims. Secret inputs are user-supplied byte buffers; no real/sample mnemonic is embedded. Examples are documentation, not executable production code.

```ts
const wallet = await createWalletClient({ network, storage, light });
// The application obtains its mnemonic from a reputable BIP39 npm package.
// Encode that mnemonic as mnemonicUtf8; zcash.js does not generate it.
// Recovery mirrors Zakura import_account_hd; account index and birthday are explicit.
const { account: saved, signer } = await wallet.accounts.import({
  mnemonic: mnemonicUtf8, passphrase: passphraseUtf8,
  accountIndex: accountIndex(0), birthday: checkpoint, name: 'Personal',
});
// Default: all available supported receivers; publishing links them and permits transparent receipt.
const defaultReceive = await wallet.addresses.next({ accountId: saved.id });
// Explicit shielded-only request.
const receive = await wallet.addresses.next({
  accountId: saved.id,
  request: { format: 'unified', sapling: 'require', ironwood: 'require', transparent: 'omit' },
});
// Explicit transparent receive, no fallback from a failed shielded receiver request.
const transparent = await wallet.addresses.next({
  accountId: saved.id, request: { format: 'transparent' },
});
await wallet.close();
await signer.dispose(); // best-effort cleanup, not a physical-erasure guarantee
```

```ts
// Full viewing wallet today; retaining data for an external signer tomorrow.
const wallet = await createWalletClient({ network, storage, light });
const tracked = await wallet.accounts.import({
  viewingKey: ufvk, name: 'Device account', birthday: checkpoint, viewOnly: false,
});
// false retains spend-supporting state; it does not imply or store a spending key.
// Generic adapter example; concrete Ledger support is an unsupported placeholder.
const device = createCustomSigner(deviceAdapter);
const binding = await wallet.accounts.attachSigner({ accountId: tracked.id, signer: device });
// Attachment validates account match; each later authorization negotiates its tuple.
await binding.dispose();
```

```ts
// Import two known recovery indices; these are not next-account allocation.
// New account creation delegates next-index selection to Zakura (D17).
for (const index of [accountIndex(0), accountIndex(1)]) {
  const { account: entry, signer } = await wallet.accounts.import({
    mnemonic: mnemonicUtf8, accountIndex: index, birthday: checkpoint,
    name: `Account ${index}`,
  });
  await wallet.accounts.attachSigner({ accountId: entry.id, signer });
}
// accountIndex(n) is the proposed checked constructor for the branded integer.
```

```ts
// Incoming-only service can issue deterministic addresses, not report a shielded balance.
const incoming = await accountFromViewingKey({
  network, format: 'uivk', encoded: uivk, enabledPools: ['sapling', 'ironwood'],
});
const issued = await addresses.derive({
  account: incoming, index: diversifierIndex(12n),
  request: { format: 'unified', sapling: 'require', ironwood: 'require', transparent: 'omit' },
});
// Service must persist its own allocation/recovery metadata; derive() does not reserve.
```



## Validation backlog before freezing the API

No new tests were run beyond documentation whitespace checks. Require pinned 1.0.0 graph vectors for BIP39 passphrase/normalization/checksum, ZIP32 Sapling/Orchard and transparent derivation, UFVK/UIVK network/unknown-component round trips, same Orchard structures routed to distinct Ironwood pool, exact transparent child bounds and address exposure/gap recovery. Validate acceptance of all checksum-valid BIP39 word counts (12/15/18/21/24) without runtime warnings or result fields and runtime randomness failures for in-scope cryptographic operations on Node and browser; mnemonic generation is application-owned. Audit secret copies/zeroization/redaction and malformed lengths before any Rust panic boundary.

Exercise unrelated seeds/multiple accounts, duplicate/subsuming/conflicting viewing imports, strict UIVK balance rejection, purpose-upgrade recovery, late/early birthday and Sapling/Ironwood prior-frontier validation. Verify account matching for every selected transparent/Sapling/Ironwood input, malicious PCZT/result mutation, unsupported tuple/device/review, partial signatures and permitted proof order. Distinguish compile, executed role tests, device interoperability and deployed activation evidence. Storage probes must cover OPFS durable reopen/WAL, crash/cancellation idempotency, backup restoration, migration failures, single-writer constraints and memory-signer disposal/reimport behavior; persistent secret-store unlock/delete tests remain deferred under D16a. Do not turn a paper API candidate into an availability claim.

## Settled scope and remaining design selections

1. **Settled by D17:** wallet onboarding mirrors Zakura with `accounts.create({ mnemonic })` for next-index creation and `accounts.import(...)` for explicit recovery; no separate public keyring or JavaScript index ledger is required in the minimal API. D21 approves accounts/PCZT/operations namespace names; secondary helper names and signatures remain preliminary.
2. **Settled (D22):** UFVK import directly calls `WalletWrite::import_account_ufvk` with public `viewOnly?: boolean`, default `false`. Omitted/false maps internally to `AccountPurpose::Spending { derivation: None }` and retains spend-supporting state; it does not imply, store or manufacture a spending key or signer. `true` maps to `AccountPurpose::ViewOnly` and may require reconstruction/rescan before later spending. Zakura has no public `import_account_uivk`; UIVK-only account import is excluded from v1 and stays in the [tracked future issue](future-issues.md), without inventing a backend path. In-place purpose-upgrade delivery remains unresolved; attachment alone cannot reconstruct spending state.
3. **Settled (D16a):** v1 uses memory plus application/external signer custody; encrypted persistent spending-key or mnemonic custody is deferred. Wallet-database confidentiality remains a separate future scope decision.
4. **Settled (D16/D19):** no mnemonic generation and no raw spending-key export in v1. Applications use a reputable BIP39 npm package and retain their mnemonic. Mnemonic recovery accepts every checksum-valid standard BIP39 word count: 12/15/18/21/24. Any preference for 24 words is documentation only, with no runtime warning or result field. zcash.js generates no mnemonics or seeds (D19).
5. **Deferred (D20):** UIVK-only wallets and less-common/unstable key imports are specified in the [tracked future issue](future-issues.md); they are not v1 owner questions.
6. **Settled (D23):** The default address request maps exactly to Zakura’s `UnifiedAddressRequest::AllAvailableKeys`: include/require every available supported receiver on the account (transparent, Sapling and the Orchard-encoded receiver used for Ironwood). Publishing this UA links these receivers and permits transparent receipt. Shielded-only is an explicit supported request, never the default; missing required receivers fail without fallback. Review address rotation/gap policy and account-discovery limits. Choose recovery UX for missing birthdays and out-of-gap indices without claiming automatic complete discovery.
7. **Settled (D11/D25):** The generic external signer/PCZT seam remains in v1. Concrete Ledger support is only a documented stub/placeholder and is unsupported until later device, app/firmware, pool, version and display/review qualification. Multisig and remote-wallet RPC are out of current scope and must not be designed now.
