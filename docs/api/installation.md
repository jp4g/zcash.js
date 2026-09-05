# Installation and import notation

::: warning Unimplemented
`zcash.js` is the proposed import name, not a published/reserved package claim. Do not run an SDK installation command based on this book. This repository installs documentation tooling only.
:::

## Review locally

From the repository root, with Node `^20.19.0` or `>=22.12.0`:

```sh
npm ci
npm run docs:typecheck
npm run docs:build
npm run docs:preview
```

Open **http://127.0.0.1:4173/**. `npm run docs:dev` serves the editing site at the same address; run one server at a time. Both commands require that exact port to be free and use base `/`. GitHub checks type-check and build only; no Pages deployment is configured.

## Read the examples

Future application notation is `import { createWalletClient } from 'zcash.js'`. The book instead includes actual compile-only source files using a local **type-only** namespace import:

<<< ./examples/notation.ts

`typeof Contract` checks proposed factory signatures without importing a runtime value. The ambient `sdk` has no implementation. Do not execute these files or cast application data into opaque brands. Application callbacks and input declarations are explicitly supplied context, not SDK exports.

The example tsconfig uses strict checking and `noEmit`; it includes `public-api.ts` directly. There is no package alias pretending an installed SDK exists and no generated JavaScript. Future package exports, ESM/CJS support, worker URLs and asset distribution still require qualification.
