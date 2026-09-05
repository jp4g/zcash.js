# Third-party Zcash provider endpoint landscape

Research date: **2026-09-04**. Planning only; all proposed package, factory and field names are **PRELIMINARY**. This document does not change the [decision log](../planning/decision-log.md), implement presets, or qualify a provider for production.

## Findings and evidence standard

External services can supply independent public and light clients without zcash.js operating infrastructure (D08). Zec.rocks is the leading native lightwallet preset candidate in this inventory. ChainSafe provides documented browser-proxy precedent. Quicknode documents public node RPC on both networks; GetBlock documents mainnet RPC. CipherScan documents REST and separately advertises lightwallet endpoints. None of these findings establishes a complete, browser-compatible transparent + Sapling + Ironwood wallet service.

This is a bounded inventory of credible provider offerings, plus historical endpoints that should not accidentally become defaults. It is not an exhaustive directory of volunteer nodes. Providers run multiple services, sometimes through other operators; an explorer, node implementation, protobuf method, or HTTPS URL is not evidence for another service or method.

Evidence labels used throughout:

| Label | Meaning |
| --- | --- |
| **D** | Documented by provider, or its own published source; deployment was not independently exercised. |
| **M** | Published monitor reports the endpoint; no direct probe by this research. Monitor timestamps and caching matter. |
| **S** | Relevant upstream protocol/source defines the operation; **deployed support remains unverified**. Not an advertised runtime capability. |
| **U** | Undocumented or unverified in the sources inspected. Does not mean unsupported. |
| **H** | Historical evidence only; not a current availability claim. |
| **R** | Officially retired; exclude from current presets. |

No authenticated service was accessed, no account or dependency was created, and no transaction, address, xpub, viewing key or wallet-specific block range was submitted. Browsing retrieved public documentation/status pages. Shell DNS failed; no successful live TLS, CORS, gRPC, gRPC-Web, node-RPC or REST method probe is claimed. “Current” below means the offering is presently documented or monitored, not a measured availability guarantee.

## Endpoint and transport inventory

Each row is a provider/network combination. Companion tables below cover individual data operations and access policies for the same IDs. Ports are included only where supported by evidence. URLs here are research evidence, **not runtime constants**.

| ID / provider / network | Published service location | Full-node/Zebra/Zcash JSON-RPC | Native lightwallet gRPC | Browser gRPC-Web | REST/indexer API | Websocket / streaming |
| --- | --- | --- | --- | --- | --- | --- |
| ZR-M · Zec.rocks · mainnet | `zec.rocks:443`; regional `na`, `eu`, `sa`, `ap` subdomains, each `:443` [ZR1][ZR2] | U: monitored Zebra backend does not expose public RPC | D/M lightwallet service [ZR2][ZR3] | U; WebZjs explicitly says native URL is insufficient [CS1] | Explorer linked at `https://explorer.zec.rocks`; historical Blockbook at `https://blockbook.zec.rocks`; stable public API contract U [ZR1][ZR7] | Websocket U; gRPC server-streaming methods S [P1] |
| ZR-T · Zec.rocks · testnet | `testnet.zec.rocks:443` [CS2][ZR4] | U | D/M | U; do not inherit mainnet or ChainSafe compatibility | Explorer `https://explorer.testnet.zec.rocks`; API U [ZR1] | Websocket U; gRPC streaming S |
| CS-M · ChainSafe · mainnet | `https://zcash-mainnet.chainsafe.dev` [CS1][CS3] | U | U at proxy ingress; native backend is Zec.rocks | D proxy; present deployment U | U | Websocket U; browser server-streaming S, not independently verified |
| CS-T · ChainSafe · testnet | `https://zcash-testnet.chainsafe.dev` [CS3] | U | U at proxy ingress; backend is testnet Zec.rocks | D historical hosting statement; present deployment U | U | Websocket U; browser server-streaming S |
| QN-M · Quicknode · mainnet | Customer provisioned HTTPS endpoint, token in URL [QN1][QN2] | D Zcash methods; exact deployed node implementation/version U | U | U | D optional Blockbook REST and `bb_*` RPC add-on [QN3] | U: HTTP documented; WSS table extraction ambiguous; status lists Zcash JSON-RPC only [QN1][QN10] |
| QN-T · Quicknode · testnet | Separately provisioned customer endpoint [QN1][QN2] | D network and method catalog; per-account validation U | U | U | D Zcash add-on; testnet provisioning/entitlement needs confirmation [QN3] | U separately for testnet |
| GB-M · GetBlock · mainnet | Customer token endpoint; docs show `https://go.getblock.io/<ACCESS-TOKEN>/`, product page shows regional shared URL [GB1][GB2] | D JSON-RPC; node implementation/version U | U | U | D Blockbook product listing; exact Zcash API/entitlement U | U: generic WebSockets marketing is not Zcash evidence |
| GB-T · GetBlock · testnet, unconfirmed | No verified network-specific endpoint | U: network selector lists mainnet, prose mentions testnets; conflict unresolved [GB1] | U | U | U | U |
| CF-M · CipherScan / Atmosphere Labs · mainnet | REST `https://api.mainnet.cipherscan.app/api`; gRPC `lightwalletd.mainnet.cipherscan.app:443` [CF1][CF2] | U: explorer says Zebrad, not a public node RPC URL | D separately advertised | U | D REST | Websocket U; REST streaming U; native gRPC streaming S |
| CF-T · CipherScan / Atmosphere Labs · testnet | REST `https://api.testnet.cipherscan.app/api`; gRPC `lightwalletd.testnet.cipherscan.app:443` [CF1][CF2] | U | D separately advertised | U | D REST, same docs explicitly cover both networks | Websocket U; REST streaming U; native gRPC streaming S |
| ZP-M · ZEC.PRO · mainnet | `lwd.zec.pro`; explorer `https://explorer.zec.pro` [ZP1] | U | D public lightwalletd; port/TLS configuration U | U | Public API marked **coming soon**; explorer indexing is not API availability | Websocket U; gRPC streaming S |
| ZP-T · ZEC.PRO · testnet | `lwd.testnet.zec.pro`; explorer `https://explorer.testnet.zec.pro` [ZP1] | U | D; port/TLS configuration U | U | Public API coming soon | Websocket U; gRPC streaming S |
| OX-M · 0xRPC · mainnet | `https://zec.0xrpc.io:443` [OX1] | U despite provider's “RPC” name | D/M lightwallet-compatible, monitor reports Zaino [OX1][ZR2] | U | U | Websocket U: provider promises it for EVM, not Zcash; gRPC streaming S |
| OX-T · 0xRPC · testnet | No published Zcash testnet endpoint found [OX1] | U | U | U | U | U |
| CK-M · Cake Wallet · mainnet lead | `zec-node.cakewallet.com:443` [ZR2] | U | M only; provider-side third-party-use commitment U | U | U | Websocket U; gRPC streaming S |
| CK-T · Cake Wallet · testnet | No verified published endpoint | U | U | U | U | U |

Zec.rocks regional endpoints share a provider identity; they are not independent operators. Per-region equivalence is unverified. Hosh also lists `zaino.testnet.unsafe.zec.rocks:443` as testnet; the name and experimental implementation warrant exclusion from convenience presets pending explicit operator guidance. Its gRPC presence is M; JSON-RPC, gRPC-Web, REST, websocket, individual methods, CORS, TLS verification, auth and limits are U. No capability transfers from the normal testnet endpoint. [ZR2]

### Historical and first-party leads

| Provider / network | Evidence and disposition |
| --- | --- |
| Nighthawk/lightwalletd.com · mainnet | **R**. Operator discontinued lightwalletd.com and ZcashBlockExplorer.com effective 2024-05-31. Old `mainnet.lightwalletd.com:9067` and regional server lists must not be resurrected from wallet source. [NH1] |
| Nighthawk/lightwalletd.com · testnet | **R** for the discontinued service; no replacement testnet offering established by the notice. [NH1] |
| ECC · mainnet | `lightwalletd.electriccoin.co:9067` has a historical 2023 metadata response, not present service authorization or uptime evidence. **H**, excluded pending ECC confirmation. [EC1] |
| ECC · testnet | No current ECC-operated public endpoint verified. **U**. A first-party SDK or lightwalletd implementation is not proof of a first-party hosted service. [P2] |
| Zecwallet / zcash-infra · mainnet and testnet | Historical ecosystem references are insufficient for a current preset. No current operator contract verified; **U** separately for each network. |
| YWallet / Zingo · mainnet and testnet | Wallets and libraries are clients, not evidence that they operate an independently available service. No owned endpoint qualified here; **U** separately for each network. |

For every historical/unqualified combination above, current JSON-RPC, native gRPC, gRPC-Web, REST, websocket/streaming, broadcast, compact ranges, trees, subtrees, transparent queries, transaction lookup/status, CORS, TLS, auth, limits, current service terms/privacy/logging and operational assurances remain **U** (or **R** for the retired Nighthawk service). The historical ECC response proves only that a metadata call once worked. Its `vendor: ECC LightWalletD` string is a software label, not proof of endpoint ownership elsewhere.

Other Hosh community servers, explorer forks, and commercial providers such as Blockdaemon/Chainstack are discovery leads, not qualified offerings here: no sufficiently specific current provider/network contract was established in this research. Do not scrape an uptime directory into a preset registry.

## Independently assessed data operations

The lightwallet protocol defines `SendTransaction`, `GetBlockRange`, `GetTreeState`, `GetLatestTreeState`, `GetSubtreeRoots`, `GetAddressUtxos`, `GetAddressUtxosStream`, transparent history/balance calls and `GetTransaction`. `GetMempoolStream` is a separate streaming operation; it does not establish websocket support. The currently inspected protocol source includes Ironwood fields and pool selectors, but explicitly requires checking server support before requesting filtered/transparent ranges. This mutable upstream source does **not** qualify any deployed endpoint or the project's pinned dependency graph. [P1]

In the table, **S for an operation means only the named protocol defines it**; provider docs/monitoring did not separately establish its deployment. Each U is a recorded verification gap, not a inferred “no.” This deliberately avoids treating “lightwalletd” as a method checklist that has passed.

| IDs / networks | Transaction broadcast | Compact block ranges | Tree state | Subtree roots | Transparent UTXOs | Transparent address history/balance | Transaction lookup / status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ZR-M mainnet | S SendTransaction | S GetBlockRange | S | S | S; M `taddr_support=true` is insufficient | S; individual methods U | S GetTransaction / mempool; status semantics U |
| ZR-T testnet | S | S | S | S | S; published metadata flag only | S | S; deployment/status U |
| CS-M mainnet | S through proxy | S through proxy | S | S | S | S; client-streaming balance must be evaluated separately | S; proxy errors/trailers and status U |
| CS-T testnet | S through proxy | S through proxy | S | S | S | S | S; deployment/status U |
| QN-M mainnet | D sendrawtransaction [QN4]; add-on sendtx [QN3] | U; full blocks are not compact ranges | D z_gettreestate [QN5] | D z_getsubtreesbyindex [QN6] | D getaddressutxos [QN7] | D catalog getaddresstxids/getaddressbalance [QN7]; add-on [QN3] | D getrawtransaction includes confirmation/height fields [QN8]; reorg/expiry guarantees U |
| QN-T testnet | D same catalog; live U | U | D catalog; live U | D catalog; live U | D catalog; live U | D catalog; live U | D catalog; live U |
| GB-M mainnet | U: attempted method doc retrieval failed | U | U | U | U | U: Blockbook label insufficient | U: attempted method doc retrieval failed |
| GB-T unconfirmed testnet | U | U | U | U | U | U | U |
| CF-M mainnet | D REST `/tx/broadcast`; gRPC S | REST U; gRPC S | REST U; gRPC S | REST U; gRPC S | REST U; gRPC S | D REST `/address/:address`; gRPC S | D REST `/tx/:txid`, raw/verbose and `/mempool/tx/:txid`; gRPC S [CF1] |
| CF-T testnet | D REST; gRPC S | REST U; gRPC S | REST U; gRPC S | REST U; gRPC S | REST U; gRPC S | D REST; gRPC S | D REST; gRPC S [CF1] |
| ZP-M mainnet | S | S | S | S | S | S; indexer source does not prove deployment | S |
| ZP-T testnet | S | S | S | S | S | S | S |
| OX-M mainnet | S | S | S | S | S | S | S |
| OX-T testnet | U | U | U | U | U | U | U |
| CK-M mainnet | S | S | S | S | S | S | S |
| CK-T testnet | U | U | U | U | U | U | U |

Node APIs and REST status observations do not supply a universal transaction receipt. An accepted submission, mempool presence, mined height, confirmation depth, reorg, expiry and “not found” need distinct semantics. In particular, a timed-out broadcast remains unknown; a preset must not trigger a new spend or automatic cross-provider rebroadcast. This follows D08/D09, not a newly settled API design.

**Ironwood readiness is U for every deployed service above.** Provider catalogs describing Orchard or Sapling trees do not establish Ironwood trees/subtrees, transaction-v6 acceptance, compact scanning data, pruning/filter support or consistency with Zakura Common 1.0.0 (D04/D06/D06a). Even a monitor reporting an upgraded backend is insufficient. Transparent compact-data delivery and address-index query support also require distinct capability entries.

## TLS, browser access, authentication, limits and operations

Policy rows explicitly apply to both listed networks only where the cited policy is provider-wide; this does not assert equivalent deployments. No TLS certificate chain or browser preflight was verified in this run.

| IDs / networks | TLS and CORS | Authentication / API keys | Documented limits | Operational/status evidence |
| --- | --- | --- | --- | --- |
| ZR-M / ZR-T | TLS D in pinned upstream URLs [CS2]; certs U. CORS U on each native endpoint | Published examples omit credentials; no-key use D, enduring access policy U [CS2][ZR3] | Numeric rate/concurrency/range limits U | Hosh D/M, with inconsistent cached timestamps; open infrastructure source D, no SLA verified [ZR2][ZR4][ZR6] |
| CS-M / CS-T | HTTPS D. Source proxy allows `*` origins, **S for deployed CORS**; binary/text framing, exposed trailers, streaming/cancellation U [CS2] | Examples omit keys; present auth U | U separately for each proxy | Hosting D/H [CS3]; current proxy status/SLA U |
| QN-M / QN-T | HTTPS D; CORS/origin/header restrictions U for each customer deployment | D URL auth token [QN2]; never embed a secret in browser bundles | D plan-specific limits and per-method credits; no universal numeric allowance [QN2] | Official status lists mainnet and testnet JSON-RPC operational in retrieved snapshot [QN10] |
| GB-M | HTTPS D; CORS U | D customer access token [GB2] | Product page advertises 800 RPS for displayed shared plan and unlimited dedicated rate; **plan marketing, not a default allowance or purchased SLA** [GB1] | Official status page reachable; Zcash-specific component not found in extracted page [GB5] |
| GB-T | U network provisioning, TLS/CORS | Account model D, testnet availability U | Testnet-specific U | Testnet-specific U |
| CF-M / CF-T | REST HTTPS D; gRPC TLS U beyond port/overall HTTPS policy. CORS U on both REST and gRPC | REST D no authentication; gRPC auth U | REST D deployment-specific headers and 429 Retry-After; numeric ceiling U. gRPC limits U [CF1] | Official status link D, page retrieval failed; SLA U [CF5] |
| ZP-M / ZP-T | TLS/port and CORS U for lightwallet endpoints; explorer HTTPS links do not settle these | Public service D; exact auth policy U | U | Provider labels services live and advertises high availability; no independently verified monitor or SLA [ZP1] |
| OX-M | HTTPS/TLS D; CORS U [OX1][OX2] | Public example without key D | Provider-wide approximate limit below 10–20 calls/sec, batches count; Zcash stream/concurrency/range accounting U [OX1] | Upptime linked; Hosh M; no SLA verified |
| OX-T | U | U | No testnet service verified | U |
| CK-M | Port 443 from monitor only; TLS/CORS U | U | U | Hosh M; operator status/third-party SLA U |
| CK-T | U | U | U | U |

A working HTTP GET, TLS connection, CORS preflight, unary gRPC-Web call and server-streaming gRPC-Web call are different checks. Native HTTP/2 gRPC cannot be assumed usable from browser fetch. CORS must cover the actual API origin/path, method, request headers, credentials mode and exposed gRPC status headers/trailers. Wildcard origins in an example proxy config do not verify deployed behavior or client-streaming support.

### Terms, privacy and logging

| Provider / networks | Evidence and limits |
| --- | --- |
| Zec.rocks · mainnet/testnet | Operator's 2025 forum statement asserts no IP logging and acknowledges need for a formal hosted policy [ZR5]. No formal service terms, retention schedule, edge/CDN logging scope, subprocessors or SLA verified. Do not restate this as audited zero logging. |
| ChainSafe · mainnet/testnet proxies | Corporate website policy covers `chainsafe.io`, including website analytics [CS4]; applicability to `chainsafe.dev` proxies U. Proxy request/IP logging, retention, upstream metadata forwarding, third-party usage terms and continued hosting require confirmation. ChainSafe and Zec.rocks are separate observers. |
| Quicknode · mainnet/testnet | Terms and privacy pages exist [QN9][QN11]. Privacy permits automatic IP/access-time collection and generally describes seven-year personal-data retention; this is **not** a verified Zcash RPC payload-log retention period. Per-endpoint RPC logs, account correlation and subprocessors need service-specific confirmation. |
| GetBlock · mainnet / unconfirmed testnet | Terms [GB3] and privacy [GB4] exist. Privacy says RPC service does not store IP/country/location, while platform/account analytics are separately collected. Payload logging, token correlation, retention and edge scope remain U; no testnet offer inferred from company policy. |
| CipherScan · mainnet/testnet | Atmosphere Labs terms describe an as-is API and prohibit excessive automated requests [CF4]. Privacy claims no IP, user-agent or browsing logs and no analytics [CF3]. Applied scope to separate API/lightwallet hosts and infrastructure intermediaries should be confirmed; no independent logging audit. |
| ZEC.PRO · mainnet/testnet | Company identified as Smart Block Software Development L.L.C.; privacy-oriented marketing [ZP1] is not a retention/no-logging policy. Terms, privacy/logging scope and SLA U. |
| 0xRPC · mainnet / unlisted testnet | Published policy claims no request attributes/IP collection, no intermediaries and encrypted connections [OX2]. Not independently audited. Do not generalize EVM WSS support to Zcash or infer testnet coverage. |
| Cake Wallet · mainnet/testnet leads | Endpoint-specific terms, third-party access permission, privacy/logging and retention U. A wallet application's privacy policy alone would not settle public node-service policy. |

Regardless of retention promises, operators can observe connection metadata and requests while serving them. Address/UTXO queries disclose transparent addresses and groupings; transaction fetches disclose interest in txids; sync timing/ranges can reveal wallet activity patterns; submission links the connection to transaction bytes. A proxy adds another observer, and API tokens permit account correlation. Never send spending keys, seeds or viewing keys merely to obtain chain data. Provider claims about logging do not remove these disclosures.

## Probe and retrieval record

Execution date 2026-09-04; a later local UTC timestamp check returned `2026-09-04T22:36:45Z`. No per-request timestamp was captured for the earlier curl attempt, so it is not invented here.

Exact shell documentation retrieval attempt:

```sh
curl -fsSL --max-time 20 https://zec.rocks/ -o /tmp/zecrocks-home.html
```

Result: curl exit **6**, `curl: (6) Could not resolve host: zec.rocks`. A following `wc -c /tmp/zecrocks-home.html` returned “No such file or directory.” This is an environment DNS failure, **not evidence that Zec.rocks is down**. `command -v grpcurl || true` produced no output; grpcurl was unavailable and was not installed. No protocol/health probes were performed.

Public-page reads used the browsing tool's `open`/`click` operations (no wallet payloads). Relevant exact URLs and results:

| Retrieval | Result and evidentiary scope |
| --- | --- |
| `open https://zec.rocks/` | Homepage retrieved; links Hosh, two explorers and infrastructure source. Does not enumerate node RPC. |
| `open https://zec.rocks/docs` | Tool Internal Error; no usable docs. Not an HTTP status measurement. |
| `open https://hosh.zec.rocks/zec` | Dashboard reports native endpoints online; it is monitor output, not this research's probe. |
| `open https://hosh.zec.rocks/zec/zec.rocks:443` | Detail snapshot last checked **2026-08-26 14:37:27.590**, main, v0.5.3, Zebra 6.3.0, `taddr_support=true`, height 3461415. Older than dashboard; do not combine as simultaneous observations. |
| Search result for `https://hosh.zec.rocks/zec/testnet.zec.rocks%3A443` | Indexed detail reports **2026-09-04 04:57:31.667**, test, v0.5.4, Zakura 1.1.0, height 4322951, `taddr_support=true`. Subsequent open returned Cache miss. This is indexed monitor evidence only. |
| `open https://explorer.zec.rocks`, `open https://blockbook.zec.rocks` | Tool Internal Error for both; API availability U. |
| `open https://www.quicknode.com/docs/zcash/api-overview`, `open https://status.quicknode.com` | Documentation and status retrieved; network rows and status components support separate mainnet/testnet RPC claims. No customer endpoint exercised. |
| `open https://www.quicknode.com/docs/zcash/security` | Tool Internal Error; endpoint security settings U. |
| `open https://docs.getblock.io/api-reference/zcash-zec/zec_sendrawtransaction`, `open https://docs.getblock.io/api-reference/zcash-zec/zec_getrawtransaction` | Tool Internal Error; not treated as method documentation or proof of unsupported methods. Getblock/getblockchaininfo docs were discoverable separately. |
| `open https://cipherscan.app/api-docs` | Tool Internal Error. Following homepage API Docs link found actual `https://cipherscan.app/docs`, retrieved successfully. |
| `open https://status.cipherscan.app` | Tool Internal Error; status link exists, operational state U. |
| `open https://lightwalletd.com/posts/june2024` | Official retirement notice retrieved. |

Source inspection also used the existing local WebZjs checkout: `git -C /tmp/WebZjs rev-parse HEAD` returned `a50df944c32243cb8da9f86e7d52cb65ac926439`; `cat /tmp/WebZjs/traefik/dynamic.yml /tmp/WebZjs/traefik/docker-compose.yml` verified network-specific upstreams and wildcard source CORS [CS2]. No containers were started. A guessed raw GitHub `main/traefik/dynamic.yml` web retrieval failed; the actual local pinned file supplies the evidence.

Future verification, **not executed**: use a provider-approved metadata-only `GetLightdInfo` request with TLS verification and a deadline; the official lightwalletd health documentation identifies that operation [P2]. Verify network, protocol version and actual method support separately. Do not use testing-only `Ping`, scan reflection indiscriminately, download arbitrary wallet ranges, or send “test” broadcasts to production. Browser metadata/preflight and bounded public-fixture streaming checks should record origin, headers, status/trailers, encoding, timestamp and exact result once provider paths are confirmed. Address/transaction fixtures and testnet broadcast testing need a separately scoped validation plan.

## Selected preset direction (not an implementation)

A preset should be a pure, inspectable description of an operator's explicitly selected service on an explicitly selected network. Constructing/importing it performs no network requests, wallet creation, telemetry or endpoint ranking. On first use, its protocol-typed transport performs the same harmless network/identity handshake as a custom endpoint. It must not provide hosted keys, signing, proving or wallet state.

| Contract element | Proposed semantics |
| --- | --- |
| Identity | Schema version, preset revision, provider ID/display name and operator ID. Network identity must include chain family, network and expected genesis/consensus context, not just a hostname. Values remain subject to future verification. |
| Services | Independently named service records with roles such as `publicRpc`, `lightGrpc`, `lightGrpcWeb`, `indexerRest`. Each has one explicit endpoint, protocol and optional path; absence is meaningful. No `supportsZcash: true` umbrella flag. |
| Protocol contract | Each service declares its protocol (`jsonRpc`, native lightwallet gRPC, browser lightwallet gRPC-Web, or a separately typed indexer API), not a caller-supplied matrix of method booleans. Selecting the protocol means the endpoint is expected to implement that supported contract. Optional methods fail with a normalized method-not-supported error when called. |
| Browser transport | Declare gRPC-Web binary/text variants, browser streaming support, CORS origin/header/credentials constraints and evidence. These belong to a service, not the provider. Node support must not imply browser support. |
| Provenance | URL, immutable commit when available, source kind, claim scope, checked date, observation date and verification notes per capability. Distinguish software definitions from deployed-service evidence. Keep stale/retired markers and changelog. |
| Privacy | Operator chain including gateways/upstreams where known, request disclosures, policy/terms/status URLs, logging claim and its evidence scope, unknown intermediaries and warnings. No automatic policy fetching on construction. |
| Authentication | Describe requirements and accept caller-supplied credential references/injection separately. Inspectable public configuration must redact secrets in diagnostics, including token-bearing URL paths/query strings. No embedded project API keys. |
| Overrides | Caller may replace any endpoint and transport. Retain source preset identity for provenance, but mark overridden service as custom and invalidate endpoint-specific verification/policy claims; caller supplies actual operator identity. Never keep a “verified Zec.rocks” badge on an arbitrary URL. |
| Routing | No automatic selection among services or operators. Native vs browser service choice is explicit. A missing browser endpoint produces an actionable configuration error; no project gateway is invented. |
| Failover/retry | Default cross-operator wallet-sync failover is disabled. Application may explicitly select a new operator after reviewing disclosures; cancel old streams, verify network, reconcile checkpoints/reorg state and record the change before resuming. Same-operator regional routing also needs an explicit policy. |
| Broadcast | Select submission service explicitly. No fan-out, hedging or cross-operator rebroadcast implicit in a preset. Preserve unknown submission outcomes and exact finalized transaction identity, as D08 requires. |
| Ownership/lifecycle | Presets own no clients. Public and light clients remain independently constructible; wallet receives a light client; optional composition shares injected instances and enforces one network without duplicate state or assumed disposal ownership. |

Static preset revisions should be reviewed and pinned through normal package releases, with no remote mutable endpoint registry. The first-use handshake validates protocol, network and supported server version; it does not silently change operators or upgrade privacy-sensitive behavior. Detailed method evidence belongs in maintainer qualification tests and this research record, not required application configuration or a large public boolean manifest.

### Packaging, naming and conceptual examples

| Placement | Evaluation |
| --- | --- |
| Core | Put provider-neutral configuration contracts/validation and transport seams here as needed by independent clients. Shipping a provider roster in core couples protocol releases to endpoint churn and makes commercial/privacy choices look like network facts. |
| Provider export | **Recommend** a tree-shakable provider subpath such as `zcash/providers` in the main distribution. This keeps setup simple while isolating frequently updated endpoint constants from protocol-neutral imports. A separate package remains possible if independent release cadence becomes necessary. Core clients must work fully with caller-supplied endpoints. |

Prefer `zecRocks({ network: 'mainnet' })` over the ambiguous `defaultProvider()` or a misleading `zebra()` factory. `zecRocks()` could eventually default to mainnet if maintainers choose and prominently document it; requiring the network in early examples is clearer. Do not infer software implementation from provider naming. `chainSafeLightwalletProxy(...)`, `quicknode(...)`, `getBlock(...)` and `cipherScan(...)` are possible descriptive names, subject to provider/maintainer review.

Conceptual usage only; these APIs and exports do not exist:

```ts
// Pure static selection; application chooses the transport/service explicitly.
const preset = zecRocks({ network: 'mainnet' });
const light = createLightClient({
  network: 'mainnet',
  transport: preset.light,
});
const wallet = createWalletClient({ light, storage, signer });

// Independent public client; using a light preset must not manufacture node RPC.
const publicClient = createPublicClient({ network: 'mainnet', service: appNodeRpc });
const zcash = createZcashClient({ public: publicClient, light, wallet });

// Endpoint replacement is explicit and resets endpoint-specific evidence.
const custom = zecRocks({
  network: 'testnet',
  lightUrl: appEndpoint,
});
```

A browser example should select a separately confirmed `lightGrpcWeb` service. If ChainSafe is selected, its manifest must identify both ChainSafe's gateway and Zec.rocks' upstream; do not tuck it inside `zecRocks()` as if it were the same operator. REST extensions can be separate indexer adapters without redefining the D08 public node-RPC client.

## Candidate disposition and required confirmation

| Candidate | Viable use after qualification | Remaining gate |
| --- | --- | --- |
| Zec.rocks mainnet/testnet | First native lightwallet preset candidate | Confirm method matrix, transparent/Sapling/Ironwood coverage, TLS, operational limits, third-party use and formal privacy/edge logging scope. Public RPC and browser presets not established. |
| ChainSafe mainnet/testnet proxies | Browser research/development candidate | Confirm continued hosting, exact deployed gRPC-Web/CORS/streaming support, limits and both operators' disclosures. No production-ready browser claim yet. |
| Quicknode mainnet/testnet | Caller-provisioned public RPC candidate; optional Blockbook adapter | Confirm account/network availability, method/pool versions, CORS, token handling, add-on entitlement, limits and service logging. |
| GetBlock mainnet | Caller-provisioned public RPC candidate | Complete method docs/validation, clarify Blockbook and retention; testnet excluded until confirmed. |
| CipherScan mainnet/testnet | REST query/broadcast candidate; separately evaluate native light service | Verify CORS, exact limits and API schema/status semantics; establish lightwallet methods/TLS and policy scope. REST UTXOs not documented in inspected catalog. |
| ZEC.PRO, 0xRPC mainnet; ZEC.PRO testnet | Additional native lightwallet candidates | Confirm method-level behavior, provider commitment and missing access/operational details; 0xRPC testnet unlisted. |
| Cake Wallet / ECC historical endpoints | Leads only | Obtain current first-party service documentation, network coverage and permission for third-party preset traffic. |
| Nighthawk/lightwalletd.com | Exclude | Officially decommissioned. |

Maintainers must decide package stewardship, naming, evidence freshness and release/deprecation policy without changing existing decisions implicitly. Providers must confirm endpoint ownership, permitted third-party traffic, exact per-network/per-service method and pool coverage, browser compatibility, auth and quotas, privacy/retention/subprocessors and incident contacts. A release qualification should use safe fixture-based transport tests and the existing G3–G5 validation workplan; it must not equate this document with completed wallet-flow validation.

## Document validation

`git diff --check` passed with no output. The repository already had an untracked `docs/` tree, so the new document was also checked with `git diff --no-index --check /dev/null docs/research/provider-endpoint-landscape.md`; it emitted no whitespace diagnostics (exit 1 indicates the added-file difference). No production code, dependencies, runtime constants or existing decisions were changed.

## Sources

All web references were inspected on 2026-09-04 unless explicitly described as indexed-only. Most live provider pages are mutable; their retrieval date is not a publication date. The WebZjs references are pinned to an existing verified checkout. No immutable deployment configuration was obtained for hosted services.

[ZR1]: https://zec.rocks/
[ZR2]: https://hosh.zec.rocks/zec
[ZR3]: https://github.com/zecrocks/zecping
[ZR4]: https://hosh.zec.rocks/zec/testnet.zec.rocks%3A443
[ZR5]: https://forum.zcashcommunity.com/t/block-explorer-directory/52158/10
[ZR6]: https://github.com/zecrocks/zcash-stack
[ZR7]: https://forum.zcashcommunity.com/t/block-explorer-directory/52158/1
[CS1]: https://github.com/ChainSafe/WebZjs/blob/a50df944c32243cb8da9f86e7d52cb65ac926439/README.md
[CS2]: https://github.com/ChainSafe/WebZjs/blob/a50df944c32243cb8da9f86e7d52cb65ac926439/traefik/dynamic.yml
[CS3]: https://forum.zcashcommunity.com/t/zcash-browser-wallet-library/47897/24
[CS4]: https://chainsafe.io/privacy-policy
[QN1]: https://www.quicknode.com/docs/zcash/api-overview
[QN2]: https://www.quicknode.com/docs/zcash/endpoints
[QN3]: https://www.quicknode.com/docs/zcash/blockbook/overview
[QN4]: https://www.quicknode.com/docs/zcash/sendrawtransaction
[QN5]: https://www.quicknode.com/docs/zcash/z_gettreestate
[QN6]: https://www.quicknode.com/docs/zcash/z_getsubtreesbyindex
[QN7]: https://www.quicknode.com/docs/zcash/getaddressutxos
[QN8]: https://www.quicknode.com/docs/zcash/getrawtransaction
[QN9]: https://www.quicknode.com/privacy
[QN10]: https://status.quicknode.com/
[QN11]: https://www.quicknode.com/terms
[GB1]: https://getblock.io/nodes/zec/
[GB2]: https://docs.getblock.io/api-reference/zcash-zec/zec_getblock
[GB3]: https://getblock.io/terms-of-service/
[GB4]: https://getblock.io/privacy-policy/
[GB5]: https://status.getblock.io/
[CF1]: https://cipherscan.app/docs
[CF2]: https://cipherscan.app/learn
[CF3]: https://cipherscan.app/privacy-policy
[CF4]: https://cipherscan.app/terms
[CF5]: https://cipherscan.app/
[ZP1]: https://zec.pro/
[OX1]: https://0xrpc.github.io/
[OX2]: https://0xrpc.github.io/privacy/
[NH1]: https://lightwalletd.com/posts/june2024
[EC1]: https://forum.zcashcommunity.com/t/unstoppable-wallet-help/45545/39
[P1]: https://raw.githubusercontent.com/zcash/lightwallet-protocol/main/walletrpc/service.proto
[P2]: https://github.com/zcash/lightwalletd

## Sapling v1 validation impact

For D04/D05, validate Sapling separately from transparent and Ironwood against each selected endpoint: compact Sapling outputs/spends, tree states/subtree roots, birthday and historical range availability, transaction retrieval/submission, reconnect, confirmation and reorg. Cataloged Sapling methods are source/documentation evidence, not an executed wallet acceptance flow. Sprout remains deferred; Orchard service labels do not establish Ironwood coverage. Run Sapling shielding/spending and supported Sapling↔Ironwood flows on the pinned graph and selected Node/browser transports before readiness. Sapling proving-parameter acquisition is a separate host asset service with hash verification, caching, packaging and worker-memory work; applications supply bytes or configure external sources, with no project-operated CDN assumed.
