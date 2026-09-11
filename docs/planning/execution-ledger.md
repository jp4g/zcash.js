# Authorized delivery execution ledger

## Owner authorization

jp4g authorizes autonomous delivery of private jp4g/zcash.js issues #2–#9, independent standalone Codex gpt-6-astra implementers/reviewers, small descriptive commits, GitHub PRs and qualified merges. This authorizes qualification and subsequent implementation, not bypassing technical gates. No publication, deployment, live blockchain/provider calls, live funds, mining, homelab changes, license selection or deferred #10–#12 expansion. Dependency/source fetches and GitHub operations are permitted. Preserve primary untracked artifacts/.

## Approved recovery amendment

Wallet opening automatically loads and reconciles ALL pending database operations. Exact stored transaction bytes may be resubmitted only under explicit documented policy. operationId remains selection/correlation identity, never a separately persisted application recovery prerequisite. Remove saveOperationId/loadOperationId as primary recovery. No getJobID API. Keep operations.resume unless a rename is explicitly justified/reconciled. Opening never rebuilds, re-signs, requests authorization/proofs, creates a new spend or reacquires secrets. Specify offline/startup, consent/rebroadcast bounds, multi-operation recovery, unknown submission, expiry/reorg, crash consistency. Update declarations, examples, decision log, host expectations, tests and relevant issues before implementation.

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

## Executed restart evidence

- Primary and origin/main remain 0e2579259642633c622b39409c042537d55b5101 after git fetch origin. Primary status only untracked artifacts/.
- Adopted existing recovery commit 2b8e8c685702a61a7059ddd6ba91e47c52b70d25; qualification worktree is clean at main. No live Codex/cargo workers at restart process inspection.
- gh auth status succeeded; gh repo view confirms isPrivate=true. Full issues #1–#12 bodies/comments read (no comments); no open PRs. Board initially #1 Done and #2–#12 Todo. #2 transitioned to In Progress, read-back pending.
- Codex 0.153.4 bounded workspace-write preflight with -m gpt-6-astra -c 'model_reasoning_effort="medium"' returned ASTRA_MEDIUM_READY. Session 01a08ec9-0e1f-7332-841d-26824e3702fa, process proc_1fa54ed3e293.
- free -h: 30 GiB RAM, 28 GiB available; df -h: 1.7 TiB available. Bound heavy builds to two jobs initially.
- Coordinator single-query safety blocks arbitrary inline Python; use ordinary tools, do not alter approvals.

## Worker ownership / handoff

- Previous coordinator PID 19225 was deliberately stopped for owner steering, not task failure. Current Hermes coordinator PID 21622; mission /home/jack/.hermes/zcash-build-mission.md.
- Steering /home/jack/.hermes/zcash-build-steering.md: ALL new work gpt-6-astra MEDIUM; independent review HIGH; review-fix LOW, explicit per-invocation Codex config. Read steering before every launch; no model substitutions.
- Recovery worktree /home/jack/zcash-worktrees/recovery, branch docs/recovery-amendment. Owns amendment; coordinator owns this ledger.
- Qualification worktree /home/jack/zcash-worktrees/qualification, branch test/issue-2-wasm-qualification. Owns qualification experiments/evidence, not shared API documents.
- Transient full logs remain outside tracked repository. Each milestone records exact commands, exit codes, reviewer disposition, commit/PR and next gate here or linked qualification evidence.

## Active slice checkpoint

- Recovery worker: PID 23336, Hermes proc_a8bb7348414e, Codex 01a08eca-ac8e-71f0-be6f-69041565f588, gpt-6-astra medium/workspace-write. Prompt /home/jack/zcash-recovery-worker.md; log /home/jack/zcash-recovery-worker.log; final /home/jack/zcash-recovery-result.md. Useful repository inspection observed.
- Qualification worker initial PID 23416 / proc_22360b30e539 was stopped at a safe boundary after sandbox DNS failures. Coordinator git ls-remote succeeded outside sandbox; not an upstream blocker. Adopted the same Codex session 01a08eca-ad47-7fb0-8513-c8f19246bebe with gpt-6-astra medium and explicitly authorized scoped danger-full-access: PID 26843 / proc_7ed90e0f4c00. Useful pinned-source fetch activity verified. Original log /home/jack/zcash-qualification-worker.log; continuation /home/jack/zcash-qualification-worker-resumed.log; prompt /home/jack/zcash-qualification-worker.md; final /home/jack/zcash-qualification-result.md. Old process and children are no longer running.
- Coordinator independently ran primary baseline npm run docs:typecheck, npm run docs:build and git diff --check: exit 0. Existing Vite chunk-size warning, not a new regression.
- #2 board read-back confirms In Progress. #1 remains closed; #3–#9 remain open with gates intact.
- Posted and read back the exact owner amendment comments: #1 comment 5629631059; #3 5629631202; #4 5629631320; #5 5629631437; #7 5629631563; #8 5629631677; #9 5629631784. Each records database-owned all-operation recovery, exact-byte/consent limits, no secret reacquisition, remaining qualification, and no publication/deployment authority.

Current next step: monitor bounded workers, independently review completed slices with gpt-6-astra high, fix findings with low, rerun checks, then push/PR/verify CI/qualified merge. Do not duplicate workers on coordinator interruption.
