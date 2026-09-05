# Contributing

`jp4g/zcash.js` is a private project in API planning and validation. There is no production SDK or SDK build/test workflow yet; the documentation website has its own tooling. Contributions at this stage should improve requirements, declarations, source traceability, examples, and repository documentation.

Read the [decision log](docs/planning/decision-log.md), [API guide](docs/api/README.md), [namespace audit](docs/planning/api-namespace-audit.md) and [workplan](docs/planning/api-surface-workplan.md) before proposing changes. Preserve decided scope. A proposed signature is not an implemented export, a source symbol is not a runtime result, and a passing TypeScript check is not wallet qualification.

## Making a reviewable change

1. Describe a concrete developer journey, documentation defect or configuration ambiguity. Link the relevant local document, decision ID and declaration.
2. Keep the change focused. Update examples and source mapping with any changed contract; describe authority, state changes, explicit defaults, cancellation, errors and recovery implications.
3. Record source provenance with immutable revision, path/symbol and evidence level. Separate inspected source from compiled, executed and independently validated behavior. Do not claim a future gate passed.
4. State what changed, why, checks run and remaining limitations in the review description. Use synthetic data in examples and reproducible checks.

Production runtime work, dependencies, package/workspace manifests, live endpoint probes, funded experiments, release automation and project setup need their own explicitly agreed scope. Disposable functional experiments follow the workplan's bounded hypotheses and F1–F8 gates; their results do not become production code automatically. Do not mix Common 1.1.0 crates into the selected coherent 1.0.0 graph. Do not select a license as part of an unrelated contribution; none is chosen here.

## Safe reports

Use the focused bug, feature or configuration forms when issue reporting is available to repository collaborators. A bug can be a contradiction in the proposed API; do not invent an SDK version for an unimplemented package. Configuration reports should use placeholder URLs/paths and synthetic snippets.

Never attach mnemonics, passphrases, seeds, spending/viewing keys, addresses, transaction IDs, account/operation identifiers, wallet databases/backups, PCZTs, memos, transaction bytes, credentials, token-bearing URLs, raw logs or screenshots containing wallet information. Private repository access does not make these safe to share. Reproduce with synthetic data and describe safe error codes and environment categories only. For a suspected security issue, contact repository owner `jp4g` directly through an established private channel before sharing details; no dedicated security service is claimed here.

## Local documentation validation

The preview command uses the Vite executable supplied by the pinned VitePress development toolchain. This VitePress release's preview server ignores `--host`; Vite preview honors the explicit loopback host and strict port. Both dev and preview must remain at base `/` and `http://127.0.0.1:4173/`.


Install the documentation-only development dependencies with `npm ci` (or `npm install` when intentionally updating the lockfile), then run `npm run docs:typecheck` and `npm run docs:build`. Use `npm run docs:dev` to edit and `npm run docs:preview` to review the built site at `http://127.0.0.1:4173/`.

```sh
git diff --check
tsc --noEmit --strict --target ES2020 --module ESNext --lib ES2020,DOM docs/api/public-api.ts
```

The documentation toolchain provides `tsc`; use `npx --no-install tsc` if it is not on your PATH. It validates declarations, not runtime implementation. Include untracked files in explicit whitespace checks because `git diff --check` omits them. Check final newlines, trailing whitespace, NULs, Markdown relative targets and heading anchors. Parse issue-form YAML with an available parser and review its required fields and privacy language. Active API-book snippets are included from compile-only files in `docs/api/examples` and checked by `npm run docs:typecheck` using local type-only imports. Historical comparison snippets are not current API examples.

Review searches for accidental Orchard pool membership, implicit account selection, backend purpose fields in public account records, mnemonic generation, raw secret export, UIVK wallet onboarding, persistent custody, nested service APIs and universal local staging. Matches in historical evidence or explicit exclusions require context, not blind replacement. Preserve planned Node/Rust lockfiles in version control once tooling is chosen.
