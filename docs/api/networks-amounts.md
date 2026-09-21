# Networks, amounts, and identifiers

## Define the network once

Pass the returned `Network` to every client and viewing operation for that chain. It is an SDK-owned value; do not manufacture one with a TypeScript cast.

```ts
import { defineNetwork } from '@jp4g/zcash.js';

const mainnet = await defineNetwork(); // same as defineNetwork('mainnet')
const testnet = await defineNetwork('testnet');
```

The package includes genesis hashes and activation schedules through NU6.3,
matching the bundled `zcash_protocol` 0.10.6. Presets are release-pinned, not
downloaded or inferred from your endpoint. Future upgrades require an updated
SDK or an explicit matching definition. The normal light-client endpoint form
creates this network for you; reuse `light.network` for the wallet.

For a custom deployment, supply a full definition:

```ts
import { blockHash, defineNetwork } from '@jp4g/zcash.js';

export async function loadNetwork(
  identity: string,
  genesisHash: string,
  parameterBytes: Uint8Array,
) {
  return defineNetwork({
    identity,
    genesisHash: blockHash(genesisHash),
    parametersFormat: 'zcash-js-network/1',
    parameters: parameterBytes,
  });
}
```

For custom definitions, your application supplies the genesis hash and exact
consensus document. The object's `identity` remains a label, not a preset selector.
Full objects replace the preset; they are not partially merged into mainnet.

Preset provenance: [zcash_protocol 0.10.6 consensus](https://docs.rs/zcash_protocol/0.10.6/src/zcash_protocol/consensus.rs.html)
and [Zcash genesis definitions](https://github.com/zcash/zcash/blob/master/src/chainparams.cpp).

The parameter document is canonical UTF-8 JSON: `encoding` (`main`, `test`, or `regtest`), followed by `Overwinter`, `Sapling`, `Blossom`, `Heartwood`, `Canopy`, `Nu5`, `Nu6`, `Nu6_1`, `Nu6_2`, and `Nu6_3`, in that order. Each upgrade is a nondecreasing activation height or `null`; no activated upgrade may follow an inactive one. Whitespace, duplicate keys, and extra keys are rejected. Obtain the matching document from your deployment configuration; changing a label does not change consensus rules. The [validator](https://github.com/jp4g/zcash.js/blob/main/src/network-parameters.ts) defines the exact format.

## Keep money exact

```ts
import { accountIndex, blockHash, diversifierIndex, formatZec, parseZec, txId } from '@jp4g/zcash.js';

export function paymentInputs(zec: string, transactionHex: string, blockHex: string) {
  return {
    amount: parseZec(zec),
    displayAmount: formatZec(parseZec(zec)),
    transaction: txId(transactionHex),
    block: blockHash(blockHex),
    account: accountIndex(0),
    addressIndex: diversifierIndex(0n),
  };
}
```

One ZEC is 100,000,000 zatoshis. Avoid `Number(zec) * 100000000`: floating-point rounding can change a payment. For application JSON, convert bigint fields to decimal strings explicitly; native `JSON.stringify` cannot serialize bigint.

`txId` and `blockHash` validate **display-order** hexadecimal identifiers. Account IDs come from `wallet.accounts` records; an account index is a derivation index, not a database account ID. Address derivation indices are bigint values validated by `diversifierIndex`.

The supported pool names are `transparent`, `sapling`, and `ironwood`. An `orchard` receiver encoding may appear in address inspection; it is not a selectable pool name.
