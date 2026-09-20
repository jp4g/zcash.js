import { createLightClient, defineNetwork, grpc } from '@jp4g/zcash.js';

// TestNetwork schedule from locked zcash_protocol 0.10.6. The SDK verifies the
// server's chain identity, Sapling activation and active consensus branch.
export async function connect(endpoint = 'https://testnet.zec.rocks:443') {
  const network = await defineNetwork({
    identity: 'zcash-testnet',
    genesisHash: '05a60a92d99d85997cce3b87616c089f6124d7342af37106edc76126334a2c38',
    parametersFormat: 'zcash-js-network/1',
    parameters: new TextEncoder().encode(JSON.stringify({ encoding: 'test',
      Overwinter: 207500, Sapling: 280000, Blossom: 584000, Heartwood: 903800,
      Canopy: 1028500, Nu5: 1842420, Nu6: 2976000, Nu6_1: 3536500,
      Nu6_2: 4052000, Nu6_3: 4134000 })),
  });
  const light = createLightClient({ network, transport: grpc(endpoint, {
    sourceId: 'testnet-acceptance', timeoutMs: 30000,
    readRetry: { attempts: 2, delayMs: 500 }, maxResponseBytes: 4 * 1024 * 1024,
  }) });
  return { network, light };
}
