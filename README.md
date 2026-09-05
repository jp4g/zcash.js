# zcash.js

Private planning repository: `jp4g/zcash.js`. **Pre-implementation: no usable SDK, npm release, production runtime, or validated wallet support is provided here.** The TypeScript examples below describe a proposed API and cannot run from this repository.

The goal is one coherent TypeScript/npm product for Node.js and browsers, backed by Zakura's Rust wallet and cryptography libraries. Independently constructible public, light, and wallet clients should support public queries, local wallet synchronization, account recovery, exact-amount payments, and generic external signing without requiring project-operated infrastructure.

## Intended v1 pool scope

| Pool | Planned scope |
| --- | --- |
| Transparent | Owned transparent receipt, queries, spending and shielding, subject to script, maturity and recovery constraints. |
| Sapling | Account/address handling, scanning, payments, local proving and qualified PCZT roles. Parameter delivery and integrity validation are required. |
| Ironwood | Distinct scanning/accounting, payments, proving and qualified PCZT roles under validated network/branch/version context. |

These are v1 support **targets**, not implemented or deployed support claims. `Pool` excludes Orchard. Ironwood reuses the Orchard receiver/key encoding; that does not make legacy Orchard a supported transaction pool. Historical legacy balances remain explicitly identified rather than silently omitted or relabeled. No activation height or hardware compatibility is asserted.

## Proposed usage

The proposed import name `zcash.js` is notation, not an installation instruction or a reserved/published package claim. `network`, transport settings, WASM assets and wallet policies come from the application; their types are specified in [public-api.ts](docs/api/public-api.ts). No endpoint, network, account or signer is silently selected.

Node public query, without opening a wallet or loading proving assets:

```ts
import { createPublicClient, http } from 'zcash.js';
import type { Network } from 'zcash.js';

declare const network: Network; // application-validated consensus descriptor

const publicClient = createPublicClient({
  network,
  transport: http('https://rpc.example.invalid', {
    sourceId: 'app-rpc', timeoutMs: 15_000,
    readRetry: { attempts: 1, delayMs: 0 }, maxResponseBytes: 4_000_000,
  }),
  observation: { pollIntervalMs: 5_000, maxBufferedUpdates: 32 },
});
const tip = await publicClient.getTip();
console.log(tip.height);
```

Browser viewing wallet, with an application-selected endpoint that permits gRPC-Web, a dedicated worker and OPFS storage:

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

The `.invalid` URLs are deliberately nonfunctional placeholders. Node wallets use `{ kind: 'node-filesystem', path: applicationPath }` with the same wallet interface. Runtime selection must qualify a separate threaded artifact and fall back to a fresh baseline instance when its startup prerequisites fail. It must never replace durable storage with memory silently.

For an already synchronized wallet configured with explicit transaction policy, broadcaster, proof assets and a matching attached or supplied signer:

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

Amounts are exact **bigint zatoshis**; `100_000_000n` is one ZEC. The confirmation counts above are illustrative application choices. `send` returns after creation/storage and the first ordered submission pass, including unknown or rejected attempts; it does not wait for mining. `wait` checks inclusion for every required transaction and may fail with retained partial state. Timeout cannot undo submission. A reviewed `send({ proposal })` executes that exact plan. Local execution is fused; advanced `build/prove/sign/finalize` apply only to supported single-step PCZT roles. Custom external signing rejects multi-step plans before disclosure.

Applications generate and back up their own mnemonic using their chosen BIP39 package. zcash.js would validate supplied 12/15/18/21/24-word phrases. Creation delegates next-index selection to Zakura; recovery requires an explicit account index and birthday/full scan. Signers returned by mnemonic onboarding are memory-only, caller-owned and unattached. `viewOnly: false` retains spend-supporting state; it does not create a signer. Default receive-address requests include all available supported receivers, linking them and allowing transparent receipt; shielded-only requests are explicit.

## Architecture and validation status

TypeScript owns transports, scheduling, application composition and external signer callbacks. An additive Rust/WASM wrapper owns checked codecs, account derivation, selection, fees/change, transaction construction, authorization verification, proving, scanning and wallet-state projections. The initial dependency baseline is the wallet libraries' coherent locked Common **1.0.0** graph; separate 1.1.0 source evidence is not permission to mix dependencies.

Bundled SQLite resides in the wallet WASM instance, with a Node filesystem VFS or browser OPFS VFS. One dedicated worker owns and serializes database access, with one writer across processes/tabs. Separate baseline and shared-memory artifacts keep crypto threading distinct from database ownership. Wallet storage contains sensitive viewing/history data, but no spending secrets; encrypted-at-rest protection is not established.

The optional `createZcashClient({ public, light, wallet })` composition references those same clients as `zcash.public`, `zcash.light` and `zcash.wallet`. Public HTTP JSON-RPC and lightwallet gRPC remain different protocols. Wallet operations/outbox recovery, complete history/inventory projections, enhancement-aware sync, VFS durability and scanner liveness require new integration work and functional proof. Source inspection and a prior mixed-graph compile spike do not satisfy those gates.

## Explicit non-goals

V1 excludes Sprout and legacy Orchard spending/automatic migration, mnemonic or seed generation, raw spending-key export, UIVK wallet import, less-common/raw key imports, persistent secret custody, concrete Ledger support, remote proving, multisig and remote-wallet RPC. Standalone UIVK viewing/address tools are separate from wallet import. Native/N-API acceleration and performance studies are deferred. There is no WebZjs API/snapshot compatibility promise, full-node consensus validator, project node/gateway/CDN, automatic provider failover, or caller capability matrix.

No license has been selected or added. The current root package contains documentation tooling only; SDK package topology and release tooling remain unestablished. Implementation is tracked on the private [zcash.js project board](https://github.com/users/jp4g/projects/4).

## Authoritative planning documents

- [API guide and source mapping](docs/api/README.md) and [proposed declarations](docs/api/public-api.ts).
- [Decision log](docs/planning/decision-log.md): owner constraints and open decisions.
- [Transaction/query API](docs/planning/transaction-query-api.md): exact execution, observations, DTOs and outbox semantics.
- [WASM host architecture](docs/planning/wasm-host-architecture.md): ownership and F1–F8 functional gates.
- [Keys, accounts and signers](docs/planning/keys-accounts-signers-api.md): authority, recovery and address semantics.
- [Namespace audit](docs/planning/api-namespace-audit.md): approved shallow resource tree.
- [API surface workplan](docs/planning/api-surface-workplan.md): G0–G6 review process; no gate completion implied.

See [CONTRIBUTING.md](CONTRIBUTING.md) for planning contributions and [future issue handoffs](docs/planning/future-issues.md) for deferred work. Research documents linked from the plans retain source evidence and historical alternatives; they do not override current decisions.

## Documentation website

The [documentation landing page](docs/index.md) organizes the proposed API, planning and research. The VitePress site reads repository Markdown and the declaration file directly; it does not build an SDK.

```sh
npm install
npm run docs:dev
npm run docs:build
npm run docs:preview
```

The docs toolchain requires Node.js `^20.19.0` or `>=22.12.0`. Preview the built site at `/zcash.js/`; build output is `docs/.vitepress/dist`. The committed npm lockfile supports reproducible `npm ci` builds. The private root manifest contains only development dependencies and docs-prefixed scripts; it sets no SDK entry points, exports, workspace topology or runtime module format. Future package work can evolve it under separately agreed scope.

The Pages workflow builds pull requests and deploys only `main`, using the GitHub Pages environment. Repository Pages settings must use GitHub Actions before deployment; adding this workflow does not enable Pages or publish the site by itself.
