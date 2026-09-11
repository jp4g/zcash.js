# Authorized delivery execution ledger

## Owner authorization

jp4g authorizes autonomous delivery of private jp4g/zcash.js issues #2–#9, independent standalone Codex gpt-6-astra implementers/reviewers, small descriptive commits, GitHub PRs and qualified merges. This is authorization to execute qualification and subsequently implement, not permission to bypass technical gates. No publication, deployment, live blockchain/provider calls, live funds, mining, homelab changes, license selection or deferred #10–#12 expansion. Dependency/source fetches and GitHub operations are permitted. Preserve primary untracked artifacts/.

## Approved recovery amendment

Wallet opening automatically loads and reconciles ALL pending database operations. Exact stored transaction bytes may be resubmitted only under explicit documented policy. operationId remains selection/correlation identity, never separately persisted application recovery prerequisite. Remove saveOperationId/loadOperationId as primary recovery. No getJobID API. Keep operations.resume unless a rename is explicitly justified/reconciled. Opening never rebuilds, re-signs, requests authorization/proofs, creates a new spend or reacquires secrets. Specify offline/startup, consent/rebroadcast bounds, multi-operation recovery, unknown submission, expiry/reorg, crash consistency. Update declarations, examples, decision log, host expectations, tests and relevant issues before implementation.

## Acceptance matrix

| Scope | Required executed evidence | Status |
| --- | --- | --- |
| Recovery amendment | Independent specification review, declaration/example checks, tests; consistent issue updates | In progress |
| #2 F1 | Coherent Common 1.0 graph; native control; baseline/threaded final link, Node/browser execution of real SQLite/crypto | Not qualified |
| #2 F2 | All-pool bounded scanner parity, actual threads/bootstrap/fallback | Not qualified |
| #2 F3 | Same-instance Node filesystem/OPFS durability, crash/migration/locking/quota/reopen | Not qualified |
| #3 F4–F6/F8 | Real transaction/proof/PCZT, sync/query/reorg, atomic outbox and fixture protocol validation | Blocked by #2 |
| #4 | Qualified production host ABI/lifecycle/worker implementation | Blocked by #2/#3 |
| #5 | Storage/accounts/addresses/recovery implementation and fixtures | Blocked by #4 |
| #6 | Public/light and sync/query implementation and fixtures | Blocked by #4/#5 |
| #7 | Send/PCZT/proving/signers/durable operations | Blocked by #5/#6 |
| #8 | Unified package, actual consumers/exports/assets/SSR checks | Blocked by #4–#7 |
| #9 | Production conformance/provenance/recovery/security checks, no npm publication | Blocked by #8 and implementation gates |

Partial slices never close an entire issue. Mock behavior, compilation alone and specification checks do not establish protocol/proving/durability qualification.

## Initial executed evidence

- Primary and origin/main: 0e2579259642633c622b39409c042537d55b5101 after git fetch origin.
- git status --short: only untracked artifacts/. No pre-existing workers/worktrees.
- gh auth status succeeded; gh repo view confirms isPrivate=true.
- Issues #2–#9 full JSON bodies/comments read; no comments initially. Board verified #1 Done and #2–#12 Todo; no open PRs.
- Codex 0.153.4 actual workspace-write preflight with -m gpt-6-astra returned ASTRA_READY, exit 0. Codex session 01a08ec6-5cd6-7413-bc2e-c554f8b4ca65, Hermes process proc_b8e341d39e69 exited.
- free -h: 30 GiB RAM, 28 GiB available; df -h: 1.7 TiB available. Bound heavy builds to two jobs initially.
- Coordinator single-query safety blocks execute_code/arbitrary inline Python; use ordinary tools, do not alter approvals.

## Worker ownership / handoff

- Coordinator: Hermes oneshot PID 19225; mission /home/jack/.hermes/zcash-build-mission.md. Foreground should inspect existing handles rather than duplicate workers.
- Recovery worktree /home/jack/zcash-worktrees/recovery, branch docs/recovery-amendment. Owns this ledger and amendment.
- Qualification worktree /home/jack/zcash-worktrees/qualification, branch test/issue-2-wasm-qualification. Owns qualification experiments/evidence, not shared API documents.
- Transient full logs remain outside tracked repository. Each milestone records exact commands, exit codes, reviewer disposition, commit/PR and next gate here or linked qualification evidence.

Current next step: run recovery specification amendment and initial #2 pinned dependency/target qualification independently; review separately and independently rerun checks before push/PR/merge.
