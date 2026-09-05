# End-to-end stakeholder walkthrough

::: warning Unimplemented
This is a narrated, type-checked scenario, not a runnable demo. No network, account, funds, keys or runtime are supplied. The complete compile-only source is included below in sequential regions; its application context supplies synthetic fixtures and UI callbacks.
:::

## 1. Set up clients and a durable wallet

A payment application selects an independently validated network, two compatible fixture endpoints, baseline/threaded artifacts, a durable storage identity, integrity-pinned proof assets and explicit transaction policy. The public client broadcasts; the light client supplies scan data. The confirmation policy is shared between queries and spending.

<<< ./examples/walkthrough.ts#setup

Review question: can the stakeholder identify which service observes queries and which service receives transaction bytes? No provider or storage fallback is implicit.

## 2. Create or import an account and attach authority

Choose exactly one onboarding path: new-account creation with an application-supplied mnemonic; recovery with an explicit index and birthday/full scan; or UFVK import retaining spend state plus a separately supplied matching signer. Applications use reputable BIP39 tooling and own mnemonic backup. Creation first explicitly syncs the empty wallet, then uses only its coherent locally verified database chain/tree state and delegates index allocation to Zakura. Creation performs no network request or implicit sync; unavailable/stale state fails `SYNC_REQUIRED` before mutation.

<<< ./examples/walkthrough.ts#onboarding

The returned local signer is initially unattached and caller-owned. A `recovery-required` binding must lead to explicit recovery UX, not a send button. UFVK import alone creates no signer.

## 3. Sync, receive and inspect

Sync reaches a finite target and processes actionable enhancement. Issue an explicit shielded-only address, then inspect updated balance and history. A separate synthetic fixture payment is a precondition for the send portion: a newly created empty account cannot spend merely because it has synced. The book neither funds nor simulates a wallet.

<<< ./examples/walkthrough.ts#receive

Review question: does the UI distinguish unavailable amounts from zero, and scan catch-up from history completeness? Only Rust selection decides whether funds are eligible. The [query chapter](queries.md) explains nullable details and inventory.

## 4. Review, send and wait

Create a proposal, privately save its operation ID before execution, and ask the user to review exact effects. The application callback represents that review; no SDK approval method exists. Local authority uses fused execution; the UFVK/external branch must satisfy the single-step PCZT restriction.

<<< ./examples/walkthrough.ts#send

`send` returns after initial ordered attempts, including unknown/rejected outcomes. `wait` requires every transaction to meet the confirmation threshold. On timeout, typed errors retain state; the surrounding example catches them and preserves allocated operation identity. In `finally`, it disposes the binding before closing the wallet, then disposes the caller-owned local memory signer. Nested `finally` blocks ensure each cleanup step is attempted even if an earlier step throws. The externally supplied signer remains application-owned.

## 5. Restart and resume without another spend

Reopen the **same durable database**, without repeating account imports or restoring heap handles. The application recovers its saved operation ID; after losing that record it can paginate `operations.list` and select the intended operation. Rehydration itself does not sign, broadcast or prompt.

<<< ./examples/walkthrough.ts#restart

If material is missing, show the recovery requirement. Otherwise explicit broadcast reconciles first and retries only exact stored bytes, then wait observes inclusion. Closing and restarting after a completed payment is safe to inspect too; canonical-mined steps are skipped by default. Memory storage would not support this scenario.

## Review the complete source

The following includes the application input/callback types, error handling and cleanup omitted from the shorter regions. All snippets above come from this same checked file.

::: details Complete compile-only scenario
<<< ./examples/walkthrough.ts
:::

Continue with [design principles](principles.md), or use the sidebar to inspect each contract. Document review findings against decision IDs and API methods; passing this walkthrough's TypeScript check does not complete functional qualification.
