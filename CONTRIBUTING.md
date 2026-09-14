# Contributing

`jp4g/zcash.js` is a private project in API planning and validation. The SDK is experimental. Run `npm run check` for lint, the current build, and all Node tests; see `tests/README.md` for fixtures and browser/TLS prerequisites. The documentation website has additional checks. Contributions follow the authorized qualification and gated implementation phase below.

Read the [decision log](docs/planning/decision-log.md), [API guide](docs/api/README.md), [namespace audit](docs/planning/api-namespace-audit.md) and [workplan](docs/planning/api-surface-workplan.md) before proposing changes. Preserve decided scope. A proposed signature is not an implemented export, a source symbol is not a runtime result, and a passing TypeScript check is not wallet qualification.

## Owner-authorized delivery phase and D26 slice

The owner authorizes private issues #2–9 qualification and subsequent gated implementation, including isolated #2 experiments and their required dependency/source fetches, tools and coherent locked Common 1.0.0 graph. Preserve G0–G6 and F1–F8 requirements: #2 must qualify F1 linking/execution, F2 scanner/thread behavior and F3 real Node/OPFS durability; #3 transaction/protocol/atomicity qualification depends on #2; #4 host implementation depends on #2/#3; #5 storage/accounts/recovery on #4; #6 transport/sync/query on #4/#5; #7 transaction/signers/operations on #5/#6; #8 packaging on #4–7; #9 conformance on #8 and the implementation gates. Production implementation follows the applicable evidence gates and G6 approval of the concrete specification and accepted limitations. Compile-only evidence does not pass them.

Work in isolated owned worktrees with small descriptive commits and independent review. The coordinator owns PRs, qualified merges, GitHub writes and `docs/planning/execution-ledger.md`; workers do not edit that ledger. Existing owner authorization covers the phase's dependencies/tools and gated implementation without redundant authorization requests.

This D26 recovery amendment slice is documentation-only: specifications/declarations, active examples, source mappings, synthetic compile-only/consistency checks and the existing documentation toolchain. It introduces no production SDK implementation or runtime dependencies. Preserve existing commits and the private package. TypeScript/site checks establish specification consistency only; protocol, atomicity and real Node/OPFS durability remain qualification blockers.

Across the authorized phase, no live blockchain/provider requests, funds, mining, homelab changes, publication/deployment, npm publish, license selection or deferred issues #10–12 work is included. Record exact validation commands/results and limitations; full logs stay outside the tracked tree.

## Making a reviewable change

1. Describe a concrete developer journey, documentation defect or configuration ambiguity. Link the relevant local document, decision ID and declaration.
2. Keep the change focused. Update examples and source mapping with any changed contract; describe authority, state changes, explicit defaults, cancellation, errors and recovery implications.
3. Record source provenance with immutable revision, path/symbol and evidence level. Separate inspected source from compiled, executed and independently validated behavior. Do not claim a future gate passed.
4. State what changed, why, checks run and remaining limitations in the review description. Use synthetic data in examples and reproducible checks.

Runtime work, dependencies, tools and package/workspace setup within #2–9 follow the authorization and gates above. Work outside that scope needs explicit owner authorization; the phase exclusions still apply. Disposable functional experiments follow the workplan's bounded hypotheses and F1–F8 gates; their results do not become production code automatically. Do not mix Common 1.1.0 crates into the selected coherent 1.0.0 graph. Do not select a license as part of an unrelated contribution; none is chosen here.

## Safe reports

Use the focused bug, feature or configuration forms when issue reporting is available to repository collaborators. A bug can be a contradiction in the proposed API; do not invent an SDK version for an unimplemented package. Configuration reports should use placeholder URLs/paths and synthetic snippets.

Never attach mnemonics, passphrases, seeds, spending/viewing keys, addresses, transaction IDs, account/operation identifiers, wallet databases/backups, PCZTs, memos, transaction bytes, credentials, token-bearing URLs, raw logs or screenshots containing wallet information. Private repository access does not make these safe to share. Reproduce with synthetic data and describe safe error codes and environment categories only. For a suspected security issue, contact repository owner `jp4g` directly through an established private channel before sharing details; no dedicated security service is claimed here.

## Local documentation validation

The preview command uses the Vite executable supplied by the pinned VitePress development toolchain. This VitePress release's preview server ignores `--host`; Vite preview honors the explicit loopback host and strict port. Both dev and preview must remain at base `/` and `http://127.0.0.1:4173/`.


Install the documentation-only development dependencies with `npm ci` (or `npm install` when intentionally updating the lockfile), then run `npm run docs:typecheck`, `npm run docs:check-recovery` and `npm run docs:build`. Use `npm run docs:dev` to edit and `npm run docs:preview` to review the built site at `http://127.0.0.1:4173/`.

```sh
git diff --check
tsc --noEmit --strict --target ES2020 --module ESNext --lib ES2020,DOM docs/api/public-api.ts
```

The documentation toolchain provides `tsc`; use `npx --no-install tsc` if it is not on your PATH. It validates declarations, not runtime implementation. Include untracked files in explicit whitespace checks because `git diff --check` omits them. Check final newlines, trailing whitespace, NULs, Markdown relative targets and heading anchors. Parse issue-form YAML with an available parser and review its required fields and privacy language. Active API-book snippets are included from compile-only files in `docs/api/examples` and checked by `npm run docs:typecheck` using local type-only imports. Historical comparison snippets are not current API examples.

Review searches for accidental Orchard pool membership, implicit account selection, backend purpose fields in public account records, mnemonic generation, raw secret export, UIVK wallet onboarding, persistent custody, nested service APIs and universal local staging. Matches in historical evidence or explicit exclusions require context, not blind replacement. Preserve planned Node/Rust lockfiles in version control once tooling is chosen.
