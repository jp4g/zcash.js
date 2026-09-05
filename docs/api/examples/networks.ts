import type * as Contract from '../public-api.js';

declare const sdk: typeof Contract;
export async function validateInputs(definition: Contract.NetworkDefinition) {
  const network = await sdk.defineNetwork(definition);
  const index = sdk.accountIndex(0);
  const receiveIndex = sdk.diversifierIndex(0n);
  const amount = 125_000n;
  return { network, index, receiveIndex, amount };
}
