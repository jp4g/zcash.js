# Wallet durability qualification — final worker result

**PASS for the requested narrow synthetic stage-7 slice on actual Node filesystem and actual Firefox OPFS.** Each host passes created/imported persisted-wallet tracers and real scanner-transaction recovery; Node additionally passes whole-process SIGKILL. Firefox externally observes all 30 dedicated-worker realms destroyed before reopen. Native reference parity, integrity and immutable producer/artifact audits pass. This is not complete F3 or a production SDK. Independent HIGH review and final integration of separately fixed source remain separate gates.

## Scope and implementation

All repository changes are under qualification/wallet-durability. Base storage revision is 6b96bddfbda280648c83099d3a895aa8d9bb0f20, scanner input is e338313ddce3abf9466aeb2d945704df135a8452. Commits 66cca21302f6a7879d8d944dffa71c8f4d0f959a and def8c6ef9eb61fe74e47e743f374dcda9ba5086b contain the new build/adapter and qualification suite. Documentation-only commit `6bdc1d79b1437a66e5785337aa9f30dafaa113c4` records the host outcomes; this is the qualified implementation/README HEAD; the report-only commit follows. No existing storage/scanner source, other worktree, upstream dependency, shared artifact/cache, security policy or installed tool was changed. This is the requested HIGH complex Codex/GPT-6 session; no model override or agents were invoked.

The build reads pinned Git objects into an immutable receipt-bound stage and includes the scanner public modules by explicit path. No live scanner checkout is a compilation input. The exact storage C adapter and Node/OPFS callbacks are used unchanged. Generated wasm-bindgen web glue is unedited. raw_exports() checks instance identity; host callbacks attach to that instance memory. rusqlite opens /wallet.db through storage-host, loads its array module, and supplies that same connection to real WalletDb/WalletMigrator. SQLite uses the existing static 16 MiB MEMSYS5 arena, TRUNCATE rollback journal, FULL synchronous writes, eight-page cache and memory temporary storage, with WAL/ATTACH disabled. No parallel SQLite or export/copy persistence is used. A separate native in-memory connection is solely the cached-scanner oracle.

Public create_account or import_account_ufvk creates one synthetic account after exactly 66 migrations. Deterministic all-zero fixture seed material is confined to memory in the synthetic public fixture; no seed/spending-key custody or persisted secret vault is implemented. Seven frozen headerless protobuf blocks run through real scan_block orchestration and unchanged transactional put_blocks. Created-account scanning uses one batch; imported-account scanning uses four batches with owner destruction/reopen between them. Native cached scanning uses the identical respective boundaries. Native parity normalizes only the opaque account UUID. Persistence comparisons normalize nothing: every row of all 44 tables, the UUID, public account/address metadata, UFVK and balances must match exactly.

Observed checks include two received notes and one spend in each of Sapling and Ironwood, persisted nullifiers/spends/scan ranges, public balances Sapling 30000 + Ironwood 45000 = 75000, retained checkpoints 100000/100002/100004/100006, and usable change-note witnesses after 1025 later irrelevant Sapling commitments. Roots match the frozen native roots. Every observation executes PRAGMA integrity_check and requires exactly [ok]. Reopen omits CREATE, migration and setup; missing paths and query failures are explicit errors, never empty success.

## Executed Node and native checks

- Native cached scanner: created/full and imported/four-batch canonical snapshots, balances, roots and witnesses pass. The created snapshot matches the original frozen native-reference.json exactly after UUID normalization. This is a distinct native reference result, not Wasm persistence evidence.
- Stage-7 Node tracer: 3/3 PASS (created account/full scan/reopen/replay; UFVK import/multiple durable batches/reopen/replay; missing database failure).
- Stage-7 Node interruptions: 6/6 PASS (four real scan transaction checkpoints; injected ENOSPC rollback/reopen/retry; repeated missing database control). Eight distinct scenarios across the two phases.
- Real journal-sync checkpoint: 28720-byte journal with zero magic, no database recovery writes, exact pre-scan state retained.
- Real first database-write checkpoint: 36864-byte hot journal, d9d505f920a163d7 magic, six real recovery database writes, exact pre-scan rollback.
- Real database-sync checkpoint: 356368-byte hot journal, 62 real recovery database writes, exact pre-scan rollback.
- Real journal-truncate checkpoint: zero-length journal, complete committed canonical state survives owner destruction. Every checkpoint retries, reopens and proves replay idempotence.
- Injected ENOSPC during genuine put_blocks: typed Commit(DbError(SqliteFailure(DiskFull,13))), exact rollback before and after reopen, successful retry. This is not actual quota exhaustion.
- Stage-5 and stage-6 separate OS process controls: PASS, actual [null,SIGKILL] process exit, second-process EBUSY, retained lock inode, hot-journal magic and six recovery writes, exact rollback plus durable retry/idempotence. Final same-stage stage-7 rerun also PASS, exit 0: actual SIGKILL, EBUSY, unchanged inode 17170650, 36864-byte hot journal, six recovery writes, exact rollback and durable idempotent retry.
- Byte inspection: one nonshared memory; only Rust dlmalloc owns memory.grow; MEMSYS5 retained; no retained WASI C heap allocator symbols/members. Pool lies below Rust heap base at load. Existing storage allocator interleaving qualification remains inherited evidence, not a newly executed stress test here.
- Registry verification: all 254 non-root package records and dependency edges exactly equal storage lock; 254 registry archives match lock checksums and 10489 extracted files match their archives. Wallet VCS metadata pins a9142ee100b3a563b7d9ba7a8e94201d00ad8154. Audit additionally compares 180 backend/SQLite/PCZT Rust files directly with that revision’s Git objects.
- Independent generator invocation by this worker reproduced all four delivered wasm-bindgen outputs byte for byte. Stage source/input/artifact/feature/map/native executable hashes all verify. Python guards use explicit exceptions; the frozen inspector asserts are transformed to unconditional exceptions before execution. No scanner Python evidence runner is imported.

## Actual Firefox OPFS and coordinator reruns

Actual packaged Firefox 155, with unchanged sandbox/security settings, ran the exact stage-7 bundle through real exclusive OPFS synchronous access handles. Tracer phase: **3/3 PASS**, 10 prepared secure/non-isolated/no-SAB contexts, **11/11 dedicated-worker realms destroyed** and 11 external before-reopen barriers. Interruption phase: **6/6 PASS**, 18 prepared contexts, **19/19 realms destroyed** and 19 barriers. The additional failed preparation per phase is the expected absent-wallet control. Browser outcomes include actual account/address/UFVK/notes/nullifiers/tree/checkpoint/spentness/balance persistence and actual integrity checks, identical to Node. The real database-write and database-sync recovery checkpoints performed six and 62 writes respectively; truncation preserved committed state. ENOSPC remains injected, explicitly not actual quota exhaustion.

`host-receipt-check-stage-7.json` checks both actual receipts, each realm set and every pre-reopen barrier. The page waits for the external runner's BiDi observations via a read-only route; terminate-called alone cannot satisfy this barrier. The host adapter takes exact corrected runner/hash, uses supported STORAGE_LOG_DIR, exposes the existing realm list plus phase, and changes none of its ownership/cancellation logic. It preserves and hashes its own adapter, adapted runner and static responder. The supplied runner is `56a81ec3dab01fc164cb87e3aade0cc92d1dca79`, SHA-256 `fe0efdfe0315ef62d6cf310875e9e0f781fc7f769368102080d6b6247b089007`; independent storage HIGH r3 review reports PASS. This new adapter still needs its own independent review.

Coordinator driver logs identify distinct loopback ports 19449 (tracer) and 19450 (interruptions), fresh browser profiles, and stopped Marionette sessions. Both phase JSON receipts and console result logs report pass:true. This worker inspected coordinator evidence; it did not claim an independent browser rerun. At report generation, coordinator-host-result.md still described stage-6; the final stage-7 suite evidence is the newer JSON/BiDi receipts and phase logs. Their outer shell exit statuses are not asserted here without a coordinator completion record.

Coordinator separately reran the stage-7 **all** Node suite: **8/8 PASS, exit 0**, no timeout under its 250-second bound. Its separate-process SIGKILL rerun also **PASS, exit 0**, no timeout under 90 seconds. `final-source-and-rerun-check.json` verifies both log hashes and the command ledger. Worker Node tracer/interruption/process commands each exited 0 under their respective bounds.

Exact browser commands used the current committed adapter and independently corrected runner (the phase environment selects bounded scenarios without mutating bundle files):

```sh
WALLET_DURABILITY_PHASE=tracer STORAGE_DRIVER_PORT=19449 STORAGE_BUNDLE=/home/jack/zcash-wallet-durability-scratch/stage-7/bundle timeout --kill-after=10s 200s python3 qualification/wallet-durability/run-host.py /home/jack/zcash-worktrees/storage-vfs/qualification/storage/run-firefox.mjs fe0efdfe0315ef62d6cf310875e9e0f781fc7f769368102080d6b6247b089007
WALLET_DURABILITY_PHASE=interruptions STORAGE_DRIVER_PORT=19450 STORAGE_BUNDLE=/home/jack/zcash-wallet-durability-scratch/stage-7/bundle timeout --kill-after=10s 200s python3 qualification/wallet-durability/run-host.py /home/jack/zcash-worktrees/storage-vfs/qualification/storage/run-firefox.mjs fe0efdfe0315ef62d6cf310875e9e0f781fc7f769368102080d6b6247b089007
```

## Exact stage-7 build and worker commands

```sh
python3 qualification/wallet-durability/build.py /home/jack/zcash-wallet-durability-scratch/stage-7
WALLET_DURABILITY_PHASE=tracer STORAGE_BUNDLE=/home/jack/zcash-wallet-durability-scratch/stage-7/bundle timeout --kill-after=5s 150s node /home/jack/zcash-wallet-durability-scratch/stage-7/bundle/run-node.mjs
WALLET_DURABILITY_PHASE=interruptions STORAGE_BUNDLE=/home/jack/zcash-wallet-durability-scratch/stage-7/bundle timeout --kill-after=5s 180s node /home/jack/zcash-wallet-durability-scratch/stage-7/bundle/run-node.mjs
STORAGE_BUNDLE=/home/jack/zcash-wallet-durability-scratch/stage-7/bundle timeout --kill-after=5s 90s node /home/jack/zcash-wallet-durability-scratch/stage-7/bundle/run-process.mjs
python3 qualification/wallet-durability/audit.py /home/jack/zcash-wallet-durability-scratch/stage-7
```

Build reproduction must use a NEW stage name: stage creation is exclusive. Cargo is offline/locked with jobs=2, Rayon=2, own copied cache/targets/TMPDIR. Exact runtime environment and producer sources are preserved in producer.json and provenance.json. Native build removes Wasm-specific SQLite allocator flags.

## Tools and immutable hashes

- rustc: rustc 1.98.1 (48a229cea 2026-09-01); executable SHA-256 `dda7234360b7f578ca8b0ddcb80145646fa61a67c1720a5abc7051b35c9fcb71` (rustc/cargo invocation proxy identities; audit additionally hashes their resolved actual executables).
- cargo: cargo 1.98.1 (797e8a9bc 2026-08-05); executable SHA-256 `dda7234360b7f578ca8b0ddcb80145646fa61a67c1720a5abc7051b35c9fcb71` (rustc/cargo invocation proxy identities; audit additionally hashes their resolved actual executables).
- clang: clang version 20.1.8-wasi-sdk (https://github.com/llvm/llvm-project 87f0227cb60147a26a1eeb4fb06e3b505e9c7261); executable SHA-256 `e78c818b321d834a20df5796afa9a9329dc53fd1f0a2597166c7a283b355be77` (rustc/cargo invocation proxy identities; audit additionally hashes their resolved actual executables).
- bindgen: wasm-bindgen 0.2.128; executable SHA-256 `dc9e4f1e03996c26fb8bfedfded73d81120a37251c3f19eb87bb460f1f89a5be` (rustc/cargo invocation proxy identities; audit additionally hashes their resolved actual executables).
- node: v26.8.1; executable SHA-256 `19235a9b678f84729464c52623f92de130a165452747c6826d3fdc13df3abcc3` (rustc/cargo invocation proxy identities; audit additionally hashes their resolved actual executables).

All following files are under stage-7 unless an absolute path is given.

| File | SHA-256 |
| --- | --- |
| producer.json | `06b37e83c2ecf8b6af4aa8916ff93860d50746c1e48c19cfef274843838ed639` |
| provenance.json | `ad656f66fc639a035e425e472bfe194c61bbf1c4d58187c337d7ca5855b2d604` |
| source/inputs.json | `d8621b59d5b990ed9735b8646b3170e045f206d3de7eb2745d768cc8b80b0060` |
| source/Cargo.lock | `4f1e1632861a8373918e8df5ecb1b2dfdc1a221a41349fb0b2a3c742a77bc5e8` |
| features.txt | `0dbbe0ca68999214448bb669edd0abdea68ca12240559e8b2e62676f7e3b3d74` |
| runtime.map | `22b6374c0d991eac8fc3285ba8acf40799b6673ff1ad1cc7d3e4fe272cb0246a` |
| inspection.json | `35142d6b3736408d6c81f8c4d9398e73e6330bcd0bea1253f7be07ba7cb74ff2` |
| registry.json | `a67466ae372f9fdb83fcb39eac823d457986956d0756c41fd266e97080795377` |
| native-reference | `0e9c784cdabd669358e531e046525b5ca509a7514c26cebd6a2d59bccef8a7be` |
| native.log | `426a0fa45f7a5855f701ec40a454badeed1d1917aa822fb482fb729e42778192` |
| raw/issue_2_qualification.wasm | `d5259bd648dfdaf0292699e17abe1aa20aff049eda76913d6775cab32171166c` |
| bundle/storage_bg.wasm | `5c6fdbe2ee80e8c444a2734e2ff19020599f063b23e2812e6fc2b3b37a1d8185` |
| bundle/storage.js | `739f85379acae5e885cc5147f3d9142b2d2e5d515c45fa5acb75d7e4cc0b0cde` |
| bundle/reference.json | `426a0fa45f7a5855f701ec40a454badeed1d1917aa822fb482fb729e42778192` |
| inputs/storage/adapter.c | `b9acae77350f61033a383fb89257423213b17471a2ee163475db290274eadaa5` |
| inputs/storage/storage-host.mjs | `bfe06e9afa362cbc93e323eb88d400d2bd918af9b055bbe39efedbc47e5ae029` |
| inputs/storage/node-fs.mjs | `190d4c270080ca76a60ae570742b8d78b2756e125a7098ae310ed3a3cb3b65a0` |
| inputs/storage/opfs.mjs | `a0076ae8984f72b0d0ddc3d0dfb4fa897ee98e88f90240fb1dd447e3f361f4e4` |
| inputs/scanner/src/lib.rs | `d9760cdf3eb7a7f1fbb62c58910b524bc356c74b4650cd9073299a804088fdd4` |
| inputs/scanner/src/fixture.rs | `05d000f7bf9532fa4f37ddd74434cc8e69fbf61451b61945451942fbb0ab3962` |
| inputs/scanner/fixtures/manifest.json | `a3d7ac25572ac3317a28740ee0e0da61ead03ce71325008fad7e25acd0ebf00f` |
| inputs/scanner/fixtures/native-reference.json | `2677d054a48b7b81df38941ccc2538c944842e6d8d29658702691b929499c38d` |
| inputs/scanner/fixtures/roots.json | `759f59fc0016385a409cea84b6b372dbf568691e81d976886d60b48e4dc3aa85` |
| inputs/scanner/fixtures/100000.pb | `a374da6cd67b73f1fffe145e5a98bc40b6da78f1a2b2935ead52e15fd9fea5cd` |
| inputs/scanner/fixtures/100001.pb | `644f1c3f373db162edb7ad2a340cab38b0f4823dc7ef0304671905c8c5af7662` |
| inputs/scanner/fixtures/100002.pb | `4f578df137b5a91ddba9736575766a2e706c8bfe29c787366dfea0b96849e1cc` |
| inputs/scanner/fixtures/100003.pb | `b2dbc6d1286d025267c97a037557590095f475a3a51172798289c3cd7840d6a5` |
| inputs/scanner/fixtures/100004.pb | `e0111a358974ee1dbfdc46317316de2c7ff159f5712a7b5dd175901dadb731c5` |
| inputs/scanner/fixtures/100005.pb | `bb4260d41cd674120c6dd19eca6c518301403ac5805c8f30980b693debc4a82e` |
| inputs/scanner/fixtures/100006.pb | `f9e21628d9ed76605608b0c0a3216651121a8cd7f68bbcee5e2467bce4dc9bf7` |
| /home/jack/zcash-wallet-durability-logs/node-tracer-stage-7.log | `91946bd10c96abc510d64ef04dbe681135f26f1de948e5b86f8ee02014d92833` |
| /home/jack/zcash-wallet-durability-logs/node-interruptions-stage-7.log | `b2bdf4df3b9d35256ca2d2851028dfa8264373e47926e86da995cbca5748c91f` |
| /home/jack/zcash-wallet-durability-logs/audit-stage-7.json | `9395c98989f1a5521fccc65d256f55f9ae67699d4e4db20b86cc81e174fdad3c` |
| /home/jack/zcash-wallet-durability-logs/import-diff-stage-6.json | `eb1a42adae22876e306b616dd9733ad8a00e67bae947082b871b673ef10e3b90` |
| /home/jack/zcash-wallet-durability-logs/coordinator-firefox-stage-6.log | `9a231baf56ba9aed0dad972dbc11be95bea9b135da6f6b20db1e77e5d58f0fc4` |
| /home/jack/zcash-wallet-durability-logs/firefox-result-1789139162286.json | `4b9dbca56551bd11e76c076e33ea36c4f0611b40c89b601cac0ea9ef7976dd38` |


Additional final evidence hashes:

| File | SHA-256 |
| --- | --- |
| /home/jack/zcash-wallet-durability-logs/process-stage-7.log | `f0c8fe2ca7c25c80663e15f686fc150a98df2e87a007ed7f620b097bc08c8271` |
| /home/jack/zcash-wallet-durability-logs/firefox-result-1789139623241.json | `8fc69aef67016cfde5c7018dbbbebfd490b551f925ef1f26017a55d194412eef` |
| /home/jack/zcash-wallet-durability-logs/firefox-result-1789139623858.json | `26e266465010854bffc9f829512491727a6a2befd77a5bb6e741ebeaf2254593` |
| /home/jack/zcash-wallet-durability-logs/coordinator-firefox-tracer-stage-7.log | `8a683dd2600f9fc6848cc6792bbbfd6fb095bf8b3ea9f0b144ff98d2ac27021e` |
| /home/jack/zcash-wallet-durability-logs/coordinator-firefox-interruptions-stage-7.log | `0bc98f75a946f3a99bbbb423821381704a240775cb47dea8ff4d1a239389e2e9` |
| /home/jack/zcash-wallet-durability-logs/host-receipt-check-stage-7.json | `a208933274a94b7597321c78121b8722dbfb1977d673fc63be99f7a6ee315686` |
| /home/jack/zcash-wallet-durability-logs/final-source-and-rerun-check.json | `b6d7c27559335bd8332b147b4bb2b07d14d167c3e1b71c834113d36732c6c327` |
| /home/jack/zcash-wallet-durability-logs/source-closure.json | `042987163de38de36caaab4b7b497975eb9f0e3b210394a4f1e492441546c7f6` |
| /home/jack/zcash-wallet-durability-logs/missing-database-audit.json | `43106be53e97dc6474ba56e5ce8b7d49438835954e32e82354f53a89a0ff4ef8` |
| /home/jack/zcash-wallet-durability-logs/coordinator/all-node-stage7-1789139623957037364.log | `faa13dff3a34f6e43fc196baae3094e2cb8604ac279ba8b046f527f9d6d44737` |
| /home/jack/zcash-wallet-durability-logs/coordinator/process-sigkill-stage7-1789139778031866305.log | `94a9138c20d476ce4044a1fa0641914c57d919eb0a6fb9bba26dcdd628eed49c` |
| /home/jack/zcash-wallet-durability-scratch/host-runner-1789139623187913999/receipt.json | `69a079ddfb0105d9de6d6e872d5e3d7175aabfa73d1fb428ab5ab111b9d2c8b6` |
| /home/jack/zcash-wallet-durability-scratch/host-runner-1789139623779001189/receipt.json | `e4a5a2482d9aea9f6735e5f4208f32291e8404bd5b537b5185a9045d76c1d9d5` |

All stage-7 consumed source files match the final implementation. Only the README and standalone audit tool postdate the stage-7 producing snapshot; neither changes the compiled module or delivered host bundle. Qualified source scope is exclusively the new qualification directory and Git is clean. Stage directories and earlier failed logs remain intact; final report excludes its own hash to avoid a circular receipt.

## Retained RED results and corrections

Stage-1 compilation rejected AddressInfo Debug formatting; the observation switched to public getters. Stage-2 native reference inherited Wasm ZERO_MALLOC flags and failed opening :memory:; native allocator flags were separated. Its attempted Node launch also lacked the failed native reference output and is retained. Stage-3 native passed but Node loader rejected the new genuine generated Ref(String)→Externref import; the exact inspected import was added to this adapter’s allowlist. Stage-4 stopped on object key-order comparison; the comparator now recursively sorts object keys. Stage-5 created tracer passed, but an imported-batch loop variable shadowed the worker starter; that local variable was renamed. Stage-6 created and imported persistence/witnesses passed, but final imported native full-batch comparison differed only in sapling_tree_shards and ironwood_tree_shards. The retained diff shows reference-mark encoding differences from transaction boundaries. Stage-7 gives native cached scanning the same four batches. No tree/state table or field was omitted to obtain green. Actual Firefox stage-6 reproduced the same oracle mismatch after its created-account tracer passed; all nine realms were destroyed.

## Remaining gates and limits

Actual host quota exhaustion, eviction/restore and missing-file recovery are unqualified. Missing-file failure is tested; it is not restore proof. No disk filling, global browser preference/security changes, live chain/funds, network wallet operations, proof/transaction construction, transaction broadcasting or secret custody was attempted. Transparent addresses from account creation persist, but transparent receipt/spend integration is not added by this slice. External migration failure on a populated/scanned wallet, wallet operation locks, outbox/revision epochs, rollback of account creation itself, OS/power loss, concurrent readers/WAL, threaded execution, other browsers/platforms and full F3 remain uncovered. Earlier storage empty-wallet external migration evidence stays separate.

The baseline scanner is e338313 and the suite accepts only the frozen headerless corpus. Its separately repaired effective-header/provenance guards are not duplicated here; final integration must consume the narrow fixed source and rerun as directed by the coordinator. The Firefox runner is supplied separately with an exact hash; this adapter does not repair or certify ownership/cancellation fixes. Independent HIGH review of this integration and coordinator-directed final fixed-source integration/reruns remain required before merge; the corrected runner itself now has its separate r3 PASS. Nothing was pushed or merged.

## Coordinator completion received immediately after report creation

The final coordinator-host-result.md confirms both actual stage-7 Firefox phases PASS and both processes exited at 11:18 without a suite timeout: tracer proc_6683265d26c6/PID275592, interruptions proc_2b9e817d78e0/PID275818. This supersedes the earlier pending completion-note status above. The exact raw receipts, 11+19 externally destroyed realms/barriers, final corrected runner hash and ports19449/19450 were already verified. Coordinator accepts the native oracle correction as matching batch inputs without any field exclusion and requests bounded finalization followed by separate independent HIGH review. The implementation is complete for this stated slice; full F3 remains unclaimed.
