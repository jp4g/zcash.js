# First P2 review-fix cycle

Bounded qualification/runtime-only slice. No production, graph, ledger, network,
generator, transformation, stub-import or agent changes. Runtime remains
approval-blocked by the coordinator receipt. No runtime acceptance or crypto
qualification was attempted or established by these controls.

- `ce01456`: worker ownership helper rejects every premature exit (including 0),
  handles test cancellation and a separate deadline, and awaits termination on
  success/error/cancellation. Six synthetic worker controls pass.
- `1b3d1e6`: imports and disassembly are regenerated with installed Node and LLVM
  from one private snapshot of selected bytes. The historical map/artifact pair
  is checked against explicit reviewed SHA-256 identities. Two synthetic input
  controls pass, including same-count changed imports and either changed pair
  member. A future artifact/map requires explicit provenance review and new
  identities; latest command labels cannot select inspection inputs.
- `4003c01`: original worker termination completes before replacement creation.
  Replacement requires a zero fixture-table count from a successful sqlite_schema
  query; Rust query errors trap. Two synthetic lifecycle controls pass, rejecting
  -1/existing-table results and checking actual thread termination ordering.

RED runs preceded each implementation and exited 1 because the new helper module
was absent. These establish test-first sequencing, not mutation testing of every
old implementation. Green controls exercise the new helpers, not real SQL/WASM.

The revised Rust export is source-only: no rebuild or runtime test was run.
The preserved historical artifact remains SHA-256
`606a000bbb8dc51868e41d0d832285c7499862d64a2514b4110e73682ff8cecd`
and its map remains
`4b84176c323095479688f2464e35a8340c89b1edd5b6318b0d54648a6aa13901`.
It does not contain the new schema export. Fresh static inspection succeeded on
that historical artifact; hashes of current sources in inspection output are
inventory only, not a claim those sources produced the historical link.
Real schema query behavior, compilation of the new export, and WASM lifecycle
acceptance remain pending an authorized later qualification slice. F1/F2/F3
remain unpassed; browser support remains required and unqualified.

Commands ran from the worktree root. Python used
`PYTHONDONTWRITEBYTECODE=1`. Logs below reside in
`/home/jack/zcash-node-runtime-logs/`.

| Command | RED exit | GREEN exit |
| --- | --- | --- |
| `node --test qualification/runtime/test-worker-harness.cjs` | 1 | 0 (one file) |
| `python3 -m unittest discover -s qualification/runtime -p test_inspection_inputs.py` | 1 | 0 (2 tests) |
| `node --test qualification/runtime/test-lifecycle.cjs` | 1 | 0 (one file) |

Additional commands: `node --test qualification/runtime/test-worker-harness.cjs qualification/runtime/test-lifecycle.cjs`
exited 0 (2 files); `node qualification/runtime/test-worker-harness.cjs` exited 0
(6 tests); `node qualification/runtime/test-lifecycle.cjs` exited 0 (2 tests).
`python3 qualification/runtime/inspect.py` exited 0 (static inspection only).
`node --check qualification/runtime/test-runtime.cjs`, both `cmp` checks of
runtime versus consumer Cargo.toml/Cargo.lock, and `git diff --check` exited 0.

## Log identities

- `fix-p2-controls-final.log`: `aa489424730dee9d9a8ca9e0ba83e30a94eebc4cfe25c8c17862b92e665a71d7`
- `fix-p2-inspector-green.log`: `f74de9c45f7d8d2fa03a87b751cb99b5540feef11cc53ce5e3fe46a0ea85c448`
- `fix-p2-inspector-red.log`: `89ce1dd79c6d2fd2928e8103d4246d5498a623066d611142fc1f6210b1350445`
- `fix-p2-lifecycle-direct.log`: `169873ab72bc6223380a38fa79f12ecb1d3138deadad224c0219b222d9d50952`
- `fix-p2-lifecycle-green.log`: `70b86b0be0281e10924e823b5e00d54a1adbe17c8ebcf23592a3d5fbd893e8bd`
- `fix-p2-lifecycle-red.log`: `bc12a1d2dfb01857bc6533c970e2179be1dca73a9a02f4ad62e0a72cc19b7f53`
- `fix-p2-static-inspection.json`: `7c4af3f32209a9cd4b349d360c12203891658af59dd5c971d2e6006280e9e09a`
- `fix-p2-worker-direct.log`: `ada780cd2330a13a0954f236a5c5f9b545b9545d23f6a19db53498ce3d7d673c`
- `fix-p2-worker-green.log`: `4534a75c4c4bb17869d30b106e316e3114b40c4ffad6b3333579ff3c4dc2af58`
- `fix-p2-worker-red.log`: `99e0c0695b26054ff96280654c91db99241ce0548494843ed49ab12e02e9667d`
