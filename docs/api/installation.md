# Installation and import notation

::: warning Unimplemented
`zcash.js` is the proposed import name, not a published/reserved package claim. Do not run an SDK installation command based on this book. This repository installs documentation tooling only.
:::

## Review locally

From the repository root, with Node `>=22.12.0`:

```sh
npm ci
npm run docs:typecheck
npm run docs:check-recovery
npm run docs:build
npm run docs:preview
```

Open **http://127.0.0.1:4173/**. `npm run docs:dev` serves the editing site at the same address; run one server at a time. Both commands require that exact port to be free and use base `/`. GitHub checks type-check and build only; no Pages deployment is configured.

## Read the examples

Examples use direct named imports from the proposed single public entry point:

```ts
import { createWalletClient, formatZec, isZcashError, parseZec } from "zcash.js";
import type { WalletOptions } from "zcash.js";
```

No namespace object is required. Types use type-only named imports; factories and utilities use ordinary named imports.

<<< ./examples/notation.ts

These are compile-only specification examples, not an implemented or installed SDK. Do not execute them or cast application data into opaque brands. Declared application inputs and callbacks represent code the consumer supplies; they are not SDK exports. The walkthrough keeps its explicit, typed application configuration outside the displayed setup region; the complete source includes those values. `parseZec` and `formatZec` are proposed root utilities for exact decimal ZEC input and display, with bigint zatoshis between them.

The example tsconfig uses strict checking and `noEmit`. Its exact `zcash.js` path alias resolves to `../public-api.ts` solely for declaration checking; it does not provide runtime module resolution or generate JavaScript. All proposed exports share this one entry point, with no utility or other subpaths. Future package distribution, ESM/CJS support, worker URLs and asset distribution still require qualification.
