# zcash.js documentation

**PROPOSED API · PRE-IMPLEMENTATION**

## A coherent TypeScript interface for Zcash — in design

Explore the proposed public, light and wallet clients, the decisions behind them, and the source evidence still to validate. **There is no usable SDK, npm release, production runtime, or validated wallet support here.** Every API example is a design sketch.

| Start with a journey | Follow the design |
| --- | --- |
| [Ordinary send](api/README.md#ordinary-send) — explicit account, exact amount, pending payment | [API guide](api/README.md) — contracts, ownership and source mapping |
| [Wallet setup](api/README.md#wallet-setup) — viewing wallet, worker and durable storage | [Planning decisions](planning/decision-log.md) — decided, open and deferred scope |
| [Accounts and receiving](api/README.md#accounts-receiving-and-authority) — recovery and signer lifecycle | [Research evidence](research/zakura-api-capability-map.md) — inspected symbols, not runtime qualification |

## Three clients, explicit responsibilities

**Public client** · Proposed wallet-independent chain queries and raw broadcast over HTTP JSON-RPC.

**Light client** · Proposed lightwallet queries and bounded streams, with application-supplied transport.

**Wallet client** · Proposed local synchronization, accounts, balances, payments and operation recovery, with Rust/WASM owning wallet state.

The intended v1 pools are transparent, Sapling and Ironwood. These are support targets only. No network activation or hardware compatibility is asserted.

## Read the contracts, then the evidence

1. Begin with the [proposed API and examples](api/README.md).
2. Review the [namespace tree](planning/api-namespace-audit.md), [transaction contract](planning/transaction-query-api.md) and [keys/accounts/signers](planning/keys-accounts-signers-api.md).
3. Follow the [WASM architecture](planning/wasm-host-architecture.md) and [validation workplan](planning/api-surface-workplan.md) for the proofs still required.
4. Consult [provider research](research/provider-endpoint-landscape.md), [Common landscape](research/zakura-common-landscape.md) and [API inspiration](research/transaction-api-inspiration-review.md) for historical evidence.

## Contribute to the design

Read the [repository overview](../README.md) and [contribution guide](../CONTRIBUTING.md). Report contradictions with synthetic examples. Never submit credentials, mnemonics, keys, wallet identifiers, addresses, txids, PCZTs, database contents, or sensitive logs.
