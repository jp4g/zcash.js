import { invalidArgument } from './errors.js';
import { blockHash } from './primitives.js';

const format = 'zcash-js-network/1';
const upgrades = ['Overwinter', 'Sapling', 'Blossom', 'Heartwood', 'Canopy', 'Nu5', 'Nu6', 'Nu6_1', 'Nu6_2', 'Nu6_3'] as const;

/** Internal document validation only; does not create or register a Network. */
export function parseNetworkParameters(input: Uint8Array, parametersFormat: string) {
  if (parametersFormat !== format || !(input instanceof Uint8Array)) throw invalidArgument();
  // Uint8Array construction copies Buffer too; Buffer.slice() would alias its input.
  let bytes: Uint8Array;
  let text: string;
  let value: Record<string, unknown>;
  try {
    bytes = new Uint8Array(input);
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    value = JSON.parse(text);
  } catch { throw invalidArgument(); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalidArgument();
  const encoding = value.encoding;
  if (encoding !== 'main' && encoding !== 'test' && encoding !== 'regtest') throw invalidArgument();
  let previous: number | null = 0;
  const heights = upgrades.map(key => {
    const height = value[key];
    if (height !== null && (typeof height !== 'number' || !Number.isInteger(height) || height < 0 || height > 0xffff_ffff || previous === null || height < previous)) throw invalidArgument();
    previous = height;
    return height;
  });
  const canonical = JSON.stringify({ encoding, ...Object.fromEntries(upgrades.map((key, i) => [key, heights[i]])) });
  // Also rejects duplicate/unknown/missing keys, order, whitespace, escapes and -0.
  if (text !== canonical) throw invalidArgument();
  return Object.freeze({ encoding, heights: Object.freeze(heights), get bytes() { return new Uint8Array(bytes); } });
}

/** Owned registration input and exact equality key, not a host token or digest. */
export function bindNetworkDefinition(definition: unknown) {
  if (!definition || typeof definition !== 'object' || Reflect.ownKeys(definition).some(key => !['identity', 'genesisHash', 'parameters', 'parametersFormat'].includes(String(key)))) throw invalidArgument();
  const { identity, genesisHash, parametersFormat, parameters: input } = definition as Record<string, unknown>;
  if (typeof identity !== 'string' || identity.length === 0 || typeof genesisHash !== 'string'
    || typeof parametersFormat !== 'string' || !(input instanceof Uint8Array)) throw invalidArgument();
  const checkedGenesis = blockHash(genesisHash);
  const parameters = parseNetworkParameters(input, parametersFormat);
  const binding = JSON.stringify([identity, checkedGenesis, parametersFormat, new TextDecoder().decode(parameters.bytes)]);
  return Object.freeze({ identity, genesisHash: checkedGenesis, parametersFormat, parameters, binding });
}
