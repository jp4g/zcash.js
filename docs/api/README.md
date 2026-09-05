# Proposed API guide

**Pre-implementation · declaration-only · not runnable.** No usable SDK, npm release, validated wallet runtime, network activation, or device support is provided. The `zcash.js` import is proposed notation.

Start with the ordinary journeys below, then inspect the [proposed declarations](public-api.ts). The [decision log](../planning/decision-log.md) governs scope; the [namespace audit](../planning/api-namespace-audit.md) governs naming. Research preserves evidence and rejected alternatives, not new support claims.

## Ordinary send

This sketch assumes an already synchronized wallet with explicit transaction policy, matching confirmation policy, broadcaster, local proof assets, and a matching supplied or attached signer. Wallet setup alone does not configure spending.

```ts
import type { AccountId, Signer, WalletClient } from 'zcash.js';

declare const wallet: WalletClient;
declare const accountId: AccountId;
declare const recipient: string;
declare const signer: Signer;

const pending = await wallet.send({
  accountId, to: recipient, amount: 125_000n, signer,
});
await pending.wait({ confirmations: 3 });
```

Amounts are exact bigint zatoshis; `100_000_000n` is one ZEC. `send` returns after creation/storage and the first ordered submission pass, including unknown or rejected attempts. It does not wait for mining. `wait` checks every required transaction; cancellation or timeout cannot undo submission and failures retain partial state. Use `wallet.operations` to inspect and recover durable operations. A reviewed `send({ proposal })` executes that exact plan without silently replanning.

## Wallet setup

Proposed browser viewing wallet with an application-selected gRPC-Web endpoint, dedicated worker and OPFS storage:

```ts
import { createLightClient, createWalletClient, grpc } from 'zcash.js';
import type { Birthday, Network, RuntimeOptions } from 'zcash.js';

declare const network: Network;
declare const runtime: RuntimeOptions; // application-resolved WASM/worker URLs and bounds
declare const checkpoint: Birthday; // validated prior chain state for recovery
declare const ufvk: string; // application input; never log or put in a URL

const light = createLightClient({
  network,
  transport: grpc('https://light.example.invalid', {
    sourceId: 'app-light', timeoutMs: 15_000,
    readRetry: { attempts: 1, delayMs: 0 }, maxResponseBytes: 4_000_000,
  }),
});
const wallet = await createWalletClient({
  network, runtime, light,
  storage: { kind: 'browser-opfs', name: 'app-wallet' },
  confirmations: { trusted: 3, untrusted: 10, allowZeroConfirmationShielding: false },
  observation: { pollIntervalMs: 5_000, maxBufferedUpdates: 32 },
});
try {
  const account = await wallet.accounts.import({
    viewingKey: ufvk, birthday: checkpoint, viewOnly: true,
  });
  await wallet.sync();
  const balance = await wallet.getBalance({ accountId: account.id });
  // amounts is null until a summary is available; scan state travels with it.
  if (balance.amounts !== null) console.log(balance.scan.scanComplete);
} finally {
  await wallet.close();
}
```

The `.invalid` endpoint is intentionally nonfunctional. Applications supply validated network/birthday data and resolved WASM/worker artifacts. Node storage would use `{ kind: 'node-filesystem', path: applicationPath }`. Durable storage must never silently fall back to memory. Threaded startup requires a separately qualified artifact with fresh baseline fallback.

## Accounts, receiving and authority

`wallet.accounts.create({ mnemonic })` delegates next-index selection to Zakura and returns an account plus a caller-owned, memory-only, unattached signer. Applications generate and back up mnemonics with their own BIP39 tooling. Recovery uses `wallet.accounts.import({ mnemonic, accountIndex, birthday })`; it requires an explicit account index and birthday or full scan.

UFVK import accepts `viewOnly`, defaulting to `false` to retain spend-supporting state. It supplies no signer. True view-only state may need reconstruction/rescan before spending; attaching a signer cannot perform that upgrade. UIVK wallet import, raw spending-key export and persistent secret custody are outside v1.

Use `wallet.addresses.current/next/list/at` with an explicit account ID. `current` does not allocate on a miss; `next` and `at` persist exposure. Default unified requests include every available supported receiver, linking receivers and permitting transparent receipt. Shielded-only requests are explicit.

## Surface and source mapping

| Proposed surface | Contract and source evidence |
| --- | --- |
| `createPublicClient`, `http`, flat public queries/broadcast | [Transaction/query plan](../planning/transaction-query-api.md), [provider evidence](../research/provider-endpoint-landscape.md) |
| `createLightClient`, `grpc`, lightwallet streams | [Transaction/query plan](../planning/transaction-query-api.md), [capability map](../research/zakura-api-capability-map.md) |
| `createWalletClient`, runtime/storage/lifecycle | [WASM host architecture and functional gates](../planning/wasm-host-architecture.md) |
| `wallet.accounts`, `wallet.addresses`, signers and standalone viewing/address tools | [Keys/accounts/signers contract](../planning/keys-accounts-signers-api.md) |
| Flat `send`, `shield`, `propose`, queries, sync and observations | [Transaction/query contract](../planning/transaction-query-api.md) |
| `wallet.pczt`, advanced PCZT stages, standalone `pczt` | [Transaction/query contract](../planning/transaction-query-api.md), [pool-specific source map](../research/zakura-api-capability-map.md) |
| `wallet.operations`, pending payment recovery | [Transaction/query contract](../planning/transaction-query-api.md), [host durability gates](../planning/wasm-host-architecture.md) |
| `createZcashClient({ public, light, wallet })` | [Approved shallow namespace tree](../planning/api-namespace-audit.md) — references the same independent clients |

Rust owns checked codecs, derivation, selection, fees/change, construction, authorization checks, proving, scanning and SQLite projections. TypeScript owns transport, scheduling and application/signer composition. The selected dependency baseline is the coherent locked Common 1.0.0 graph; separate 1.1.0 evidence does not authorize mixed dependencies.

## Execution boundaries

Local send is fused. Advanced `build/prove/sign/finalize` describe supported single-step PCZT roles, not universal local staging. Custom external signing rejects multi-step plans before disclosure. Proof and signature ordering follows qualified protocol roles. A UFVK does not replace proving or spending authority.

The intended pools are transparent, Sapling and Ironwood. Orchard receiver/key encoding reused by Ironwood does not add legacy Orchard to `Pool`. Historical legacy balances remain explicitly identified. Sapling parameter delivery/integrity and Ironwood network/branch/version applicability require validation.

Networks, endpoints, accounts and signers are explicit. Factories do not invent endpoints or fail over silently. Queries carry observation/scan state; unavailable balances are not zero. Errors, bounded streams, cancellation, transaction identity and retained unknown broadcast outcomes are part of the proposed contract.

## Validation status and reporting

The declaration freeze is a review baseline, not G3–G6 approval. Type-checking proves only TypeScript consistency; functional storage, scanner, transport and transaction gates remain open in the [workplan](../planning/api-surface-workplan.md) and [host plan](../planning/wasm-host-architecture.md). See [deferred work](../planning/future-issues.md) before extending scope.

Do not submit credentials, mnemonics, keys, wallet identifiers, addresses, txids, PCZTs, database contents, or sensitive logs. Use synthetic examples and placeholder URLs/paths only.
