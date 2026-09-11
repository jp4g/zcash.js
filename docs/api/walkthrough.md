# End-to-end stakeholder walkthrough

::: warning Unimplemented
This is a narrated, type-checked scenario, not a runnable demo. No network, account, funds, keys or runtime are supplied. The compile-only source is excerpted below in sequential regions; it uses direct named imports from the proposed `zcash.js` entry point and a few declared application inputs and helpers.
:::

The examples use root named imports, including exact ZEC amount conversion:

```ts
import {
  createLightClient, createPublicClient, createWalletClient, defineNetwork,
  formatZec, grpc, http, isZcashError, parseZec,
} from "zcash.js";
import type { WalletOptions } from "zcash.js";
```

## 1. Set up clients and a durable wallet

A payment application selects an independently validated network, two compatible fixture endpoints, a baseline runtime artifact, a durable storage identity, integrity-pinned proof assets and explicit transaction policy. The public client broadcasts; the light client supplies scan data. The confirmation policy is shared between queries and spending. The complete source below defines `appTransportOptions`, `appObservation` and the typed `appWalletConfiguration` before this region; the application supplies `networkDefinition` and `appProving`. Runtime limits, placeholder artifact pins and transaction policy remain explicit there, with no SDK defaults.

<<< ./examples/walkthrough.ts#setup

Review question: can the stakeholder identify which service observes queries and which service receives transaction bytes? No provider or storage fallback is implicit.

## 2. Create an account and attach its local signer

Create one new account with an application-supplied mnemonic. Applications use reputable BIP39 tooling and own mnemonic backup. First explicitly sync the empty wallet, then create the account from its coherent locally verified database chain/tree state. Zakura allocates the account index. Creation performs no network request or implicit sync; unavailable/stale state fails `SYNC_REQUIRED` before mutation. Mnemonic recovery and UFVK import are separate paths in [accounts and signers](accounts-signers.md).

<<< ./examples/walkthrough.ts#onboarding

The returned local signer is initially unattached and caller-owned. A `recovery-required` binding must lead to explicit recovery UX, not a send button.

## 3. Sync, receive and inspect

Sync reaches a finite target and processes actionable enhancement. Issue an explicit shielded-only address, then inspect updated balance and history, using `formatZec` for exact decimal balance display. A separate synthetic fixture payment is a precondition for the send portion: a newly created empty account cannot spend merely because it has synced. The book neither funds nor simulates a wallet.

<<< ./examples/walkthrough.ts#receive

Review question: does the UI distinguish unavailable amounts from zero, and scan catch-up from history completeness? Only Rust selection decides whether funds are eligible. The [query chapter](queries.md) explains nullable details and inventory.

## 4. Review, send and wait

Parse the payment form’s decimal ZEC string with `parseZec` (at most 8 fractional digits, no scientific notation). Create a proposal and ask the user to review exact effects. Its operation identity is persisted in the wallet database. The application callback represents that review; no SDK approval method exists. The attached local signer uses fused execution. Pass the same immutable proposal to `send`; changes require a new proposal and fresh review.

<<< ./examples/walkthrough.ts#send

`send` returns after initial ordered attempts, including unknown/rejected outcomes. `wait` requires every transaction to meet the confirmation threshold. On timeout, typed errors retain state; the surrounding example catches them and shows private recovery state. In `finally`, it disposes the binding first, then closes the wallet, then disposes the caller-owned local memory signer. Nested `finally` blocks ensure each cleanup step is attempted even if an earlier step throws.

## 5. Restart and resume without another spend

Reopen the **same durable database**, without repeating account imports or restoring heap handles. Opening automatically reconciles all recorded operations locally, then performs a bounded observation pass through the configured light client. No separately saved operation ID is needed. UI listing and optional handle selection are separate from recovery.

<<< ./examples/walkthrough.ts#restart

Show missing material and inspect `reopened.recovery` for incomplete startup observation. Default opening never broadcasts; explicit broadcast is a separate consent action. Optional startup rebroadcast only retries previously attempted exact bytes with stored consent and durable bounds; see the [recovery policy](operations.md). Memory storage cannot support restart recovery.

## Review the complete source

The following includes imports, declared application inputs and review and recovery display helpers, error handling and cleanup omitted from the shorter regions. All snippets above come from this same checked file.

::: details Complete compile-only scenario
<<< ./examples/walkthrough.ts
:::

Continue with [design principles](principles.md), or use the sidebar to inspect each contract. Document review findings against decision IDs and API methods; passing this walkthrough's TypeScript check does not complete functional qualification.
