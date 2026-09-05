# zcash.js · proposed v1 API book

::: warning Unimplemented
A specification for stakeholder review, with no usable SDK, npm release or validated wallet runtime. All API examples are compile-only. This site implements documentation only.
:::

**[Start the end-to-end walkthrough →](api/walkthrough.md)**

Follow one application from explicit client setup through account creation/import, sync, receive, balance inspection, reviewed payment, waiting, restart recovery and close. Then use the ordered chapters to review each behavior and its failure cases.

## Read in order

Begin with [status and scope](api/README.md), [principles](api/principles.md) and [installation notation](api/installation.md). Continue through networks, public/light clients, wallet/accounts, receiving, sync/queries, send/review/signing and recovery. Finish with errors, privacy, platform limits, the [full reference](api/reference.md) and the [versioned Rust/WASM boundary](api/host-contract.md).

Transparent, Sapling and Ironwood are proposed v1 targets, not validated deployments. Viewing authority, signing, proving and durable state remain separate responsibilities. Examples preserve exact bigint amounts and never turn an unknown submission into a new spend.

## Review locally

From the repository root, run `npm ci`, `npm run docs:typecheck`, `npm run docs:build`, then `npm run docs:preview`. Open **http://127.0.0.1:4173/**. Use `npm run docs:dev` instead while editing. No Pages deployment is configured.

The [decisions](planning/decision-log.md) govern settled scope. Planning/research are retained in collapsed sidebar sections as evidence, including historical alternatives. They do not override the current [declarations](api/public-api.md). See [contributing](contributing.md) for safe synthetic review reports.
