# Private delivery status

This is a private implementation checkpoint at qualified SDK source `29aee5560f17c9c36ab3957d5519cb294fc47223` (PR #114 integration pending remote confirmation), not v1 acceptance or a publication announcement. The owner authorized local distribution qualification for [#8](https://github.com/jp4g/zcash.js/issues/8) and [#9](https://github.com/jp4g/zcash.js/issues/9); `private: true` remains intentional. Publication, deployment and license selection are not authorized by these results.

## Qualified scope

The [payment qualification record](wallet-payments-qualification.md) binds the accepted synthetic Node filesystem and Firefox OPFS workflows to their source, runtime package and retained receipts. It covers public wallet construction, local transfer/shielding/TEX execution, PCZT proving/finalization, consent-bounded exact-byte recovery, a retained draft alongside a finalized operation, and the separately recorded worker-interruption cases. Those interruption checks do not establish whole-process crash recovery or in-page detection of silent browser-worker termination.

[Installation](../api/installation.md) records local tarball installation, Node ESM, browser imports, declarations, query-only tree-shaking, and the tested Vite/Webpack paths. The Webpack browser check opens, reads and closes an OPFS wallet using unchanged verified external assets; it does not run proving through that bundle. No CommonJS `require` entry is provided or claimed.

## Final workflow followthrough

Both original E2E05 processes exited zero using native `bb74dace75d6f1ca3c43108cf46390db9469b5e4`, build receipt `635f8a8163fbd94c4c7ff0a2d6a47b5b3971b070b18475f7bfbe7f4428e4cdb7`, and runtime manifest `8388ccc38b861ef5da60eaa7ced46809afaea826dd8821769a117bc780a7f677` (packaging source `e786711`). Native PR #28 and SDK PR #114 merge status is not asserted here.

The shared workflow additionally qualifies an Ironwood-funded public local send, empty-fork replacement/replay/reopen, and two finalized operations discovered in one database without replenishing the older retry budget. The separate supplemental native funding fixture retains its own `9813235` source and hash receipt; it is not relabeled as output of the final producer. Two-operation recovery is not a large-inventory fairness claim. Existing #116 fault-coverage limits remain.

Node log: `/tmp/final-wallet-gaps-node-05.log`, SHA-256 `731d191116fa8eff4e3d01090c2f019497655aa201b7d67c28b9d2100a7ad61a`. Firefox receipt: `/home/jack/zcash-final-wallet-gaps-firefox-05-logs/firefox-3EjUSL.json`, SHA-256 `1539a37abc3c6bc70f864780d2d433782ac2b75059765ca96adb9421fc1a6295`: 45 workers destroyed, 301,589 ms, no unexpected requests, complete cleanup. Independent evidence review checked 82 saved assets. Earlier failed attempts remain retained; neither those failures nor older receipts were rebound to this result.

## Known limitations and dispositions

- [#98](https://github.com/jp4g/zcash.js/issues/98) is resolved: mnemonic account creation/import no longer accepts `enabledPools`; native HD allocation retains the full supported key set. Viewing imports and spend/address policy remain separate.
- [#97](https://github.com/jp4g/zcash.js/issues/97) now has passing actual Node/Firefox evidence for canonical UFVK-fingerprint lookup through a custom adapter and native key correspondence. [PR #114](https://github.com/jp4g/zcash.js/pull/114) remains pending remote merge confirmation in these notes; source qualification is not a merge claim.
- [#102](https://github.com/jp4g/zcash.js/issues/102) is explicitly deferred. Native import can retain verified finalized transparent scripts, but wallet finalization rejects already-finalized transparent inputs with `METHOD_NOT_SUPPORTED`. External signing that returns partial signatures and ordinary local sending remain in scope.
- [#107](https://github.com/jp4g/zcash.js/issues/107) tracks the current healthy-threaded wallet artifact/build boundary. Qualified baseline execution and missing-prerequisite fallback do not establish healthy-threaded wallet support.

- [#115](https://github.com/jp4g/zcash.js/issues/115) tracks third-party notice reconciliation and artifact license provenance; the factual inventory does not fulfill those obligations.
- [#116](https://github.com/jp4g/zcash.js/issues/116) tracks current-artifact OPFS quota, interrupted-write and opening-migration qualification. Older fault receipts and current dispatch-interruption checks do not establish those results for the current runtime.

#107, #115 and #116 remain unresolved qualification/tooling obligations, not waivers or completed gates. The deferred [#10–#12](future-issues.md) scope is unchanged. These notes do not close the remaining frozen capability or conformance gates.

## Security, privacy and provenance

The [security/privacy contract](../api/security-privacy.md) documents application-owned mnemonic input, caller-owned signers, sensitive viewing/history/PCZT data, network disclosure and trusted artifact pinning. Worker isolation is not a secure enclave; no encrypted-at-rest wallet or persistent spending-secret vault is claimed. Functional checks and independent source reviews support the specific behaviors recorded above, not a completed security/privacy audit.

Accepted receipts bind source archives, JS/WASM and worker inputs, artifact hashes and actual host results. Installation verifies the trusted manifest digest and executable closure. This is provenance for the named private artifacts, not a claim that every build is bit-for-bit reproducible or that a published artifact exists.

Dependency/license closeout is still missing. A subsequent [factual transitive inventory](dependency-inventory.md) records the existing npm/native metadata and explicitly unresolved notice/source inputs; it does not provide clearance. The npm lockfile records license metadata for its 223 dependency entries, and the [native research inventory](../research/zakura-common-landscape.md) explicitly limits itself to direct-package observations. Neither constitutes a reviewed transitive inventory spanning npm tooling, Rust crates, native C/WASI inputs and packaged artifacts, with applicable license/notice obligations reconciled. No such complete inventory or dependency/security clearance is established by the retained qualification records. Record that evidence before claiming #9's dependency/license checks passed; selecting this project's own license is a separate, unauthorized action.
