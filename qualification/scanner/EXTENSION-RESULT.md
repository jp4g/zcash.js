# Executed scanner extension, 2026-09-11

Native **14/14**, generated unshared Node **6/6**, and actual Firefox155.0.1 no-SAB
**6/6** passed. Node observed six worker exits. Firefox observed six matching
WebDriver BiDi worker creations/destructions and successful session, browser,
process-group and loopback-server cleanup. Local receipt auditing compared every
returned case result to the immutable native reference JSON and checked the actual
realm events, exact full script URL, owner and order. This is bounded synthetic
scanner qualification, not full F2 or a production gate.

Executable source commit: `d179e21a91ec71e6da859dc8afdc4292f2b21c99`.
The later documentation commits do not change executable inputs. Portable cases
and their capture-once native references were committed in `01e5b31`.
See [EXTENSION.md](EXTENSION.md) for the acceptance matrix and threaded interface.
No original fixture changed from e338313, and no extension reference changed from
01e5b31. Ordinary tests did not regenerate fixtures. Wallet source remains
`a9142ee100b3a563b7d9ba7a8e94201d00ad8154`; Common stays1.0.0.

The closed bundle is
`/home/jack/zcash-scanner-scratch/bundles/extension-reviewed-2`.
It contains48 source files and25 hashed web assets. Its source Rust/manifests/lock
were compared to the successful native command's input inventory. Prior
`extension-01e5b31` and `replay-web` outputs remain unchanged.

| Artifact | SHA256 |
| --- | --- |
| web/manifest.json | 65ba569ec3416c0414452fce380f1406e49c605b73eb9744b65733e53ae94eb6 |
| raw WASM | 431f83ba9559aaa7d914b2ba3d1e7c5ca6c340c754b7b249ad57c823a6c96ee1 |
| generated scanner_bg.wasm | 4b142187d010c419f0388b7d2bcf0cd3de5cf818b7bc29da7286f29e8c595016 |
| source inventory | 160c4f1976b800d95bcee0cbb9715ce7a7de86ed86a06de0104c626cfc762273 |
| bundle/provenance.json | 493920174816e70ee1bf1c0d4f66edd794e0afa492c03a595d1162395b8a9dc2 |
| Cargo.lock | 6947df6fe679c437b828cc94fc15d82f769bed58467022f25ae0400a51963690 |

Exact successful commands from the repository root (labels are already consumed;
choose fresh labels for any repeat):

```sh
python3 qualification/scanner/run.py review-native-green 300 cargo test --offline --locked -- --test-threads=1 --nocapture
python3 qualification/scanner/run.py review-guards-green 30 python3 test_guards.py
python3 qualification/scanner/run.py review-js-green 30 node replay/test-extension.mjs
python3 qualification/scanner/run.py extension-build-2 600 python3 -O build-wasm.py --stage extension-reviewed-2
python3 qualification/scanner/run.py extension-node-2 420 node /home/jack/zcash-scanner-scratch/bundles/extension-reviewed-2/web/node.mjs 65ba569ec3416c0414452fce380f1406e49c605b73eb9744b65733e53ae94eb6
python3 qualification/scanner/run.py extension-final-integrity 60 python3 -O check.py
```

Coordinator executed the exact closed Firefox runner outside the worker sandbox,
with an additional500-second foreground bound. The runner itself has a480-second
suite bound and60-second page watchdog for each worker. Packaged geckodriver
selected Firefox without a binary option or security changes:

```sh
/home/jack/.hermes/node/bin/node /home/jack/zcash-scanner-scratch/bundles/extension-reviewed-2/web/run-firefox.mjs --artifacts /home/jack/zcash-scanner-scratch/bundles/extension-reviewed-2/web --manifest-sha256 65ba569ec3416c0414452fce380f1406e49c605b73eb9744b65733e53ae94eb6 --logs /home/jack/zcash-scanner-logs/firefox-extension-2 --scratch /home/jack/zcash-scanner-scratch --geckodriver /snap/bin/geckodriver
```

Full logs live under `/home/jack/zcash-scanner-logs`; measured wall times are
execution evidence, not benchmarks.

| Receipt | Actual result | SHA256 |
| --- | --- | --- |
| review-native-green.log | 14 passed;130.37s test time | c7417334003385a06af468037839d160f0a159662b13d51371e6a09cc41d9162 |
| extension-node-2.log | 6 passed/6 exits;55.70s process time | a6c7cbf3b1bec3c92cf9e36a1838e276d11e131972b9709d20909f84b84395dc |
| firefox-extension-2/firefox-1789138022488.json | 6 passed/6 destroyed;cleanup exit0 | 6d18a448a5efa4977e3e4fedcbe8f3cefbd9ecb1e8c598f474e244c599ccaa2e |
| coordinator-firefox-extension-2.log | Full actual Firefox event/output stream | a5ede06c8a93ba73af52ecf78772be1bfd3132c1d15abd9b03fe5a475d13b6cb |
| coordinator/node-six-cases-bound-1789138100962810486.log | Independent Node6 passed;output byte-identical | a6c7cbf3b1bec3c92cf9e36a1838e276d11e131972b9709d20909f84b84395dc |

`extension-stage-2-integrity.json` checks source/artifact/fixture identity.
`extension-stage-2-host-audit.json` records parsed results, lifecycle checks,
cleanup, commands and receipt hashes. `commands.jsonl` includes local input/output
inventories, environment, exact argv, deadlines and exit codes. The coordinator's
first extension Node invocation omitted the newly mandatory manifest hash and
correctly failed before replay; its failed log is retained alongside the passing
bound rerun. Stage1 Node6/6 and native13/13 receipts are also retained.

Test-first evidence is preserved: `extension-red.log` (six missing cases fail),
`extension-consumer-red-direct.log` (two missing consumer controls fail),
`review-header-red.log` (real header-predecessor bypass commits), and
`review-guards-red.log` (four integrity controls fail). Final controls pass4/4
Python and3/3 JavaScript; optimized Python integrity and actual optimized build
pass. The header regression also executed in both Node and Firefox failures cases.

Integration caveat: the coordinator's separate scanner-fixes assignment was read
after d179e21 had already committed overlapping fixes for the three e338313 review
findings. That commit is preserved; reconcile with the separate fix branch before
integration. No other worker source was edited. Independent re-review of the
extension/fix combination remains outstanding.

Unexecuted here: shared-runtime inline parity, actual cached scanner execution on
the initialized WASM pool, shared scanner lifecycle/parity, durable storage,
request servicing, additional Orchard/nonempty pool and extended reorg/pruning
matrices, proof/consensus qualification and production SDK/gates. Neither empty
blocks nor runtime pool bootstrap establish these criteria. No scheduling failure
was reproduced; no private wallet/tree code or speculative scheduler patch added.
