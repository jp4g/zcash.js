import type { Birthday, LightClient, Op } from './types.js';
import { networkBinding } from './network.js';
import { snapshot, ownBytes } from './clients/owned-plumbing.js';
import { operation } from './clients/light-chain-reads.js';
import { failure, invalidArgument, isZcashError } from './errors.js';
import { initialize } from './runtime/lightwire-capsule.mjs';
const invalidBirthday = () => failure('PROTOCOL_MISMATCH', 'account', 'correct-input', 'Invalid birthday tree state.');
const mismatch = () => failure('NETWORK_MISMATCH', 'account', 'correct-input', 'Birthday network mismatch.');
const resource = () => failure('RESOURCE_LIMIT', 'account', 'configure', 'Birthday tree exceeds limit.');

export async function resolveBirthday(args: {light: LightClient; firstScanHeight: number; recoverUntilExclusive?: number} & Op): Promise<Birthday> {
  const owned = snapshot(args, ['light', 'firstScanHeight', 'recoverUntilExclusive', 'signal']);
  const {light, firstScanHeight: first, recoverUntilExclusive: recover} = owned;
  if (!Number.isInteger(first) || first < 1 || first > 0xffff_ffff
    || recover !== undefined && (!Number.isInteger(recover) || recover < first || recover > 0xffff_ffff)) throw invalidArgument();
  const network = light?.network, bound = networkBinding(network);
  const read = light.getTreeState;
  if (typeof read !== 'function') throw invalidArgument();
  let pending: ReturnType<typeof operation>;
  try { pending = operation(owned.signal); } catch { throw invalidArgument(); }
  try {
    pending.check();
    const result = snapshot(await pending.wait(Reflect.apply(read, light, [{height: first - 1, signal: pending.signal}])),
      ['network', 'point', 'sapling', 'ironwood', 'encoded', 'sourceId', 'observedAt']);
    pending.check();
    if (networkBinding(result.network).definition.binding !== bound.definition.binding) throw mismatch();
    const point = snapshot(result.point, ['height', 'hash']);
    if (point.height !== first - 1) throw invalidBirthday();
    const bytes = ownBytes(result.encoded, invalidBirthday, resource);
    if (bytes.length > 65536) throw resource();
    const dto = initialize().decodeResponse('GetTreeState', bytes) as {height: string; hash: string; sapling_tree: string; ironwood_tree: string};
    if (dto.height !== String(point.height) || dto.hash !== point.hash) throw invalidBirthday();
    for (const [value, encoded] of [[result.sapling, dto.sapling_tree], [result.ironwood, dto.ironwood_tree]] as const) {
      if (value === null) { if (encoded !== '') throw invalidBirthday(); }
      else {
        const tree = ownBytes(value, invalidBirthday, resource);
        if (encoded.length !== tree.length * 2 || tree.some((byte, i) => byte.toString(16).padStart(2, '0') !== encoded.slice(i * 2, i * 2 + 2))) throw invalidBirthday();
      }
    }
    const genesis = Uint8Array.from(network.genesisHash.match(/../g)!.reverse(), byte => parseInt(byte, 16));
    bound.codec.validateBirthday(bound.definition.parameters.bytes, genesis, first, bytes, recover);
    pending.check();
    return {network, firstScanHeight: first, priorTreeState: bytes, ...(recover === undefined ? {} : {recoverUntilExclusive: recover}), source: 'light-client'};
  } catch (error) {
    pending.check();
    if (isZcashError(error)) throw error;
    const name = typeof error === 'string' ? error : error instanceof Error ? error.message : '';
    throw name === 'NETWORK_MISMATCH' ? mismatch() : invalidBirthday();
  } finally { pending.close(); }
}
