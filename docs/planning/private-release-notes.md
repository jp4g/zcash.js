# Private delivery status

This is a private implementation checkpoint at SDK `8f57675`, not v1 acceptance or a publication announcement. The owner authorized local distribution qualification for [#8](https://github.com/jp4g/zcash.js/issues/8) and [#9](https://github.com/jp4g/zcash.js/issues/9); `private: true` remains intentional. Publication, deployment and license selection are not authorized by these results.

## Qualified scope

The [payment qualification record](wallet-payments-qualification.md) binds the accepted synthetic Node filesystem and Firefox OPFS workflows to their source, runtime package and retained receipts. It covers public wallet construction, local transfer/shielding/TEX execution, PCZT proving/finalization, consent-bounded exact-byte recovery, a retained draft alongside a finalized operation, and the separately recorded worker-interruption cases. Those interruption checks do not establish whole-process crash recovery or in-page detection of silent browser-worker termination.

[Installation](../api/installation.md) records local tarball installation, Node ESM, browser imports, declarations, query-only tree-shaking, and the tested Vite/Webpack paths. The Webpack browser check opens, reads and closes an OPFS wallet using unchanged verified external assets; it does not run proving through that bundle. No CommonJS `require` entry is provided or claimed.

## Known limitations and dispositions

- [#98](https://github.com/jp4g/zcash.js/issues/98) is resolved: mnemonic account creation/import no longer accepts `enabledPools`; native HD allocation retains the full supported key set. Viewing imports and spend/address policy remain separate.
- [#97](https://github.com/jp4g/zcash.js/issues/97) remains pending at this checkpoint. The generic UFVK-account signer lookup correction and expanded host checks in [PR #114](https://github.com/jp4g/zcash.js/pull/114) are not included in this acceptance record. Neither a passing final matrix nor merge is claimed here.
- [#102](https://github.com/jp4g/zcash.js/issues/102) is explicitly deferred. Native import can retain verified finalized transparent scripts, but wallet finalization rejects already-finalized transparent inputs with `METHOD_NOT_SUPPORTED`. External signing that returns partial signatures and ordinary local sending remain in scope.
- [#107](https://github.com/jp4g/zcash.js/issues/107) tracks the current healthy-threaded wallet artifact/build boundary. Qualified baseline execution and missing-prerequisite fallback do not establish healthy-threaded wallet support.

- [#115](https://github.com/jp4g/zcash.js/issues/115) tracks third-party notice reconciliation and artifact license provenance; the factual inventory does not fulfill those obligations.
- [#116](https://github.com/jp4g/zcash.js/issues/116) tracks current-artifact OPFS quota, interrupted-write and opening-migration qualification. Older fault receipts and current dispatch-interruption checks do not establish those results for the current runtime.

#107, #115 and #116 remain unresolved qualification/tooling obligations, not waivers or completed gates. The deferred [#10–#12](future-issues.md) scope is unchanged. These notes do not close the remaining frozen capability or conformance gates.

## Security, privacy and provenance

The [security/privacy contract](../api/security-privacy.md) documents application-owned mnemonic input, caller-owned signers, sensitive viewing/history/PCZT data, network disclosure and trusted artifact pinning. Worker isolation is not a secure enclave; no encrypted-at-rest wallet or persistent spending-secret vault is claimed. Functional checks and independent source reviews support the specific behaviors recorded above, not a completed security/privacy audit.

Accepted receipts bind source archives, JS/WASM and worker inputs, artifact hashes and actual host results. Installation verifies the trusted manifest digest and executable closure. This is provenance for the named private artifacts, not a claim that every build is bit-for-bit reproducible or that a published artifact exists.

Dependency/license closeout is still missing. A subsequent [factual transitive inventory](dependency-inventory.md) records the existing npm/native metadata and explicitly unresolved notice/source inputs; it does not provide clearance. The npm lockfile records license metadata for its 223 dependency entries, and the [native research inventory](../research/zakura-common-landscape.md) explicitly limits itself to direct-package observations. Neither constitutes a reviewed transitive inventory spanning npm tooling, Rust crates, native C/WASI inputs and packaged artifacts, with applicable license/notice obligations reconciled. No such complete inventory or dependency/security clearance is established by the retained qualification records. Record that evidence before claiming #9's dependency/license checks passed; selecting this project's own license is a separate, unauthorized action.
