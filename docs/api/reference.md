# Full API reference

::: tip Proposed Contract
The complete declaration file is included on the [declaration page](public-api.md), with every exported type, field, overload and error code. This index groups the entire public surface by task; there are no additional runtime exports or package subpaths implied.
:::

## Factories, composition and foundational types

`defineNetwork`, `accountIndex`, `diversifierIndex`, `txId`, `blockHash` validate inputs. `parseZec(value: string): bigint` and `formatZec(zatoshis: bigint): string` convert decimal ZEC strings and exact bigint zatoshis without floating-point arithmetic. See [networks and amounts](networks-amounts.md) for `NetworkDefinition`, `Network`, `ConsensusContext`, `AccountId`, `AccountIndex`, `DiversifierIndex`, `TxId`, `BlockHash`, `Pool`, `ShieldedPool`, `ReceiverType`, `SecretInput`, `NonEmpty`, `Op` and `Disposable`.

`http`, `grpc`, `createPublicClient`, `createLightClient`, `createWalletClient`, `createZcashClient` construct the proposed clients/transports. See [public](public-client.md), [light](light-client.md) and [wallet](wallet-runtime.md) chapters for `TransportOptions`, `HttpTransport`, `GrpcTransport`, `LightUnaryMethod`, `LightStreamMethod`, `CustomLightTransport`, `ObservationOptions`, `WalletOptions`, `WalletStorage`, `RuntimeOptions`, `WasmArtifact`, `ArtifactManifest`, `ArtifactFile`, `RuntimeDiagnostic`, `AssetRequirement`, `LocalProvingOptions`, `ConfirmationsPolicy` and `TransactionPolicy`. `ZcashClient` composition references existing instances without disposal ownership.

## PublicClient

- `getTip`, `getBlock`, `getBlockHeader`: `ChainTip`, `BlockSelector`, `PublicBlock`, `BlockHeader`, `ChainPoint`, `BlockHash` and `SourceObservation`.
- `getTransaction`, `getTransactionStatus`: `PublicTransaction`, `TransactionObservation`, `Inclusion`.
- `getUtxos`, `getTreeState`, `getSubtreeRoots`: `PublicUtxos/PublicUtxo`, `TreeState`, `SubtreeRequest/SubtreeRoot`.
- `broadcastTransaction`, `waitForTransaction`, `watchTransaction`: `BroadcastReport`, `WaitOptions`, `ConfirmedTransaction`, observations.

See [public client](public-client.md) for null/error distinctions, endpoint trust, bounds and dispatch semantics.

## LightClient

`getTip`, `getServerInfo`, `getTransaction`, `getAddressUtxos`, `getAddressBalance`, `getTreeState`, `getSubtreeRoots`, `streamCompactBlocks`, `streamAddressTransactions`, `streamMempool`, `broadcastTransaction`. It shares public DTOs and adds `LightServerInfo`, `HeightRange`, `CompactBlock`. See [light client](light-client.md) for inclusive ranges, protobuf revision, uint64 sentinels and pull-bounded streams.

## WalletClient resources

`AccountsApi` (`accounts.create/import/list/get/remove/attachSigner/detachSigner`): `AccountCreate`, `MnemonicImport`, `ViewingImport`, `CreatedAccount`, `AccountRecord`, `SignerBinding`, `Birthday`. `resolveBirthday` is standalone. Mnemonic import returns a signer; UFVK import returns a record. [Account contract](accounts-signers.md).

`WalletAddressesApi` (`addresses.current/next/list/at`): `AccountAddressArgs`, `AddressRequest`, `AddressRecord`. Current returns string/null; next/at persist exposure. [Receive contract](receive-addresses.md).

`pczt.export/import`: `WalletPcztApi`, `PcztExchange`, `PcztArtifact`, associated with a known wallet operation. [Signing contract](signing.md).

`operations.list/get/resume`: `OperationsApi`, `OperationPage`, `PageArgs`, `PaymentState`, `PendingPayment`. List can be wallet-wide; resume has no signing/dispatch effect. [Recovery contract](operations.md).

## WalletClient flat methods

`send`, `shield`, `propose`: `Payment`, `MemoInput`, `SendIntent`, `ShieldIntent`, `ExecuteOptions`, `Proposal`, `ReviewedInput/ReviewedOutput`. Send takes intent or exact proposal; shield takes intent; propose accepts send or tagged shield intent. [Payments](send-shield.md) and [review](proposals.md).

`build`, `prove`, `sign`, `finalize`: single-step `PcztArtifact` roles; finalize stores without dispatch. `broadcast` takes operation ID. These do not expose universal local staging. [Signing routes](signing.md).

`getBalance`, `getHistory`, `getTransaction`, `listNotes`, `listUtxos`: `WalletBalance/BalanceBuckets`, `HistoryPage/HistoryEntry`, `WalletTransaction/TransactionOutput`, `Memo`, `ObservedPool`, `InventoryFilter/InventoryState/SpendState`, `WalletNote/WalletUtxo`, `NotePage/UtxoPage`, `ScanState`. [Queries](queries.md).

`sync`, `watchSync`, `getSyncStatus`: `SyncStatus`, `ScanState`, optional pinned `ChainPoint` and cancellation. `close` is idempotent and preserves ownership of injected resources. [Sync](sync.md) and [lifecycle](errors-lifecycle.md).

## PendingPayment

`snapshot`, `events`, `broadcast`, `wait`. `SubmissionAttempt` retains started/acknowledged/rejected/unknown results separately from inclusion/expiry. `PaymentConfirmation` contains all required confirmed transactions plus snapshot. `WaitOptions` defaults to one positive confirmation and no deadline. [Operations](operations.md).

## Standalone viewing, addresses and signers

`accountFromViewingKey`, `viewing.export/toIncoming`: `AccountDescriptor`, `ViewKeyHandle`, `ViewingApi`; explicit viewing disclosure, UFVK/UIVK codecs without UIVK wallet import. `addresses.derive/find/decode/selectReceiver`: `AddressApi`, `DecodedAddress`, `SelectedReceiver`; derivation has no wallet exposure side effect. [Accounts](accounts-signers.md) and [addresses](receive-addresses.md).

`createCustomSigner`, `Signer.getCapabilities/getAccount/authorize`, disposable `MemorySigner`: `SignerCapabilities`, `SignerSelector`, `SigningRequest/SigningResult`. Negotiation and actual key/effect checks precede acceptance. No concrete hardware adapter or raw secret export. [Signing](signing.md).

## Standalone PCZT and errors

`pczt.parse/serialize/inspect/combine/redact`: `PcztApi`, disposable `PcztHandle`, `PcztInspection`. Explicit consensus context and bounds; versioned redaction profiles. No wallet association is inferred.

`isZcashError`: narrows unknown values to `ZcashError`. `ErrorInfo` and `ErrorCode` define every machine code, stage, recovery hint and sanitized message; optional private state attachments preserve partial work. Read the [error chapter](errors-lifecycle.md) before using `retryable`.

For implementation review, each group maps to the [H1 command catalog](host-mapping.md). Exact fields and signatures follow on the [declaration page](public-api.md); all examples import that same source for compile-only checking.
