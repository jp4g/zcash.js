# Contributing

Use Node 22.12 or newer. The repository contains the implemented experimental SDK, its tests, and a developer guide.

## Workflow

Sync local `main` before starting work, create a focused branch, and open a separate PR for each issue. Describe the behavior changed, the checks run, and any remaining limitations. Link a resolved issue with `Closes #...`.

```sh
npm ci
npm run check
npm run docs:typecheck
npm run docs:check-recovery
npm run docs:build
```

Run checks relevant to the change. [tests/README.md](https://github.com/jp4g/zcash.js/blob/main/tests/README.md) explains native fixtures, actual browser runners, and optional runtime/proving workloads. Keep experiments and logs in ignored scratch directories. Do not use real funds or live private wallet data as test fixtures.

## API and documentation

`src/index.ts` owns package exports; `src/types.ts` owns shared contracts. The developer guide lives in `docs/api` and uses `SUMMARY.md` for both GitBook and local sidebar navigation. Update usage examples alongside API changes. Displayed TypeScript fences are checked against the actual package entry by `npm run docs:typecheck`.

Use `npm run docs:dev` to edit the guide and `npm run docs:preview` to preview its build at `http://127.0.0.1:4173/`. The older host specifications and example files are retained for internal reference. Planning/research record historical decisions, not alternate current APIs or standing deployment instructions.

## Review standards

Prefer deletion and direct code over extra forwarding layers. Preserve input ownership, cancellation, resource limits, completion receipts, and payment durability. Existing tests should protect observable behavior; avoid tests that merely duplicate implementation structure or assert documentation wording.

## Sensitive reports

Keep mnemonics, passphrases, spending/viewing keys, wallet databases, PCZTs, credentials, and private account/transaction data out of issues, logs, and screenshots. Reproduce problems with synthetic data and sanitized error codes. Contact repository owner `jp4g` privately before sharing sensitive security details.

## Distribution

The package remains private. A documentation build does not publish a package or a website. Retain the MIT license and third-party notices when distributing locally built artifacts.
