import type { BuiltinNetwork, NetworkDefinition } from './types.js';
import { blockHash } from './primitives.js';
import { invalidArgument } from './errors.js';

// Activation schedules: locked zcash_protocol 0.10.6, consensus.rs Main/TestNetwork.
// Genesis hashes: zcash/zcash src/chainparams.cpp CMainParams/CTestNetParams.
// Update with the bundled native protocol; never learn consensus rules from an endpoint.
export function networkPreset(name: BuiltinNetwork): NetworkDefinition {
  if (name !== 'mainnet' && name !== 'testnet') throw invalidArgument();
  const main = name === 'mainnet';
  return {
    identity: main ? 'zcash-mainnet' : 'zcash-testnet',
    genesisHash: blockHash(main
      ? '00040fe8ec8471911baa1db1266ea15dd06b4a8a5c453883c000b031973dce08'
      : '05a60a92d99d85997cce3b87616c089f6124d7342af37106edc76126334a2c38'),
    parametersFormat: 'zcash-js-network/1',
    parameters: new TextEncoder().encode(JSON.stringify(main
      ? {
          encoding: 'main',
          Overwinter: 347500,
          Sapling: 419200,
          Blossom: 653600,
          Heartwood: 903000,
          Canopy: 1046400,
          Nu5: 1687104,
          Nu6: 2726400,
          Nu6_1: 3146400,
          Nu6_2: 3364600,
          Nu6_3: 3428143,
        }
      : {
          encoding: 'test',
          Overwinter: 207500,
          Sapling: 280000,
          Blossom: 584000,
          Heartwood: 903800,
          Canopy: 1028500,
          Nu5: 1842420,
          Nu6: 2976000,
          Nu6_1: 3536500,
          Nu6_2: 4052000,
          Nu6_3: 4134000,
        })),
  };
}
