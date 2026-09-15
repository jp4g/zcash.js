import type { Signer, SignerCapabilities } from './types.js';
import { snapshot, ownBytes } from './clients/owned-plumbing.js';
import { operation } from './clients/light-chain-reads.js';
import { networkBinding } from './network.js';
import { accountIndex } from './primitives.js';
import { checkedAccountDescriptor } from './viewing.js';
import { failure, invalidArgument, isZcashError } from './errors.js';

const protocol = () => failure('PROTOCOL_MISMATCH', 'authorization', 'reattach-signer', 'Invalid signer response.');
const limit = () => failure('RESOURCE_LIMIT', 'authorization', 'configure', 'Signer value exceeds limit.');
const rejected = () => failure('SIGNER_REJECTED', 'authorization', 'reattach-signer', 'Signer request failed.');
const text = (value: unknown): string => {
  if (typeof value !== 'string' || !value.length) throw invalidArgument();
  if (value.length > 4096) throw limit();
  return value;
};
const uint = (value: unknown): number => {
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 0xffff_ffff) throw invalidArgument();
  return value as number;
};
function member<T extends string>(value: unknown, choices: readonly T[]): T {
  if (!choices.includes(value as T)) throw invalidArgument();
  return value as T;
}
function list<T>(value: unknown, item: (value: unknown) => T): T[] {
  if (!Array.isArray(value)) throw invalidArgument();
  const property = Object.getOwnPropertyDescriptor(value, 'length');
  if (!property || !Object.hasOwn(property, 'value')
    || !Number.isSafeInteger(property.value)
    || property.value < 0) throw invalidArgument();
  const length: number = property.value;
  if (length > 1024) throw limit();
  return Array.from({ length }, (_, index) => {
    const property = Object.getOwnPropertyDescriptor(value, String(index));
    if (!property || !Object.hasOwn(property, 'value')) throw invalidArgument();
    return item(property.value);
  });
}
export function signerCapabilities(value: unknown): SignerCapabilities {
  let remaining = 65536;
  const charge = (size: number) => {
    if ((remaining -= size) < 0) throw limit();
  };
  const string = (value: unknown) => {
    const result = text(value);
    charge(result.length * 2);
    return result;
  };
  const number = (value: unknown) => {
    charge(8);
    return uint(value);
  };
  const owned = snapshot(
    value,
    ['revision', 'networks', 'authorizations', 'accountDiscovery', 'exportableViewing', 'maxPcztBytes'],
  );
  if (typeof owned.maxPcztBytes !== 'number'
    || !Number.isSafeInteger(owned.maxPcztBytes)
    || owned.maxPcztBytes <= 0) throw invalidArgument();
  return {
    revision: string(owned.revision),
    networks: list(owned.networks, string),
    authorizations: list(owned.authorizations, (item) => {
      const row = snapshot(
        item,
        ['pool', 'txVersion', 'branchIds', 'circuitVersions', 'pcztVersions', 'proofState', 'requiredFields', 'review'],
      );
      return {
        pool: member(row.pool, ['transparent', 'sapling', 'ironwood']),
        txVersion: number(row.txVersion),
        branchIds: list(row.branchIds, number),
        circuitVersions: list(row.circuitVersions, string),
        pcztVersions: list(row.pcztVersions, number),
        proofState: member(row.proofState, ['required', 'not-required', 'either']),
        requiredFields: list(row.requiredFields, string),
        review: member(row.review, ['device', 'application']),
      };
    }),
    accountDiscovery: member(owned.accountDiscovery, ['explicit-index', 'enumeration', 'imported-only']),
    exportableViewing: list(owned.exportableViewing, format => member(format, ['ufvk', 'uivk'])),
    maxPcztBytes: owned.maxPcztBytes,
  };
}
function response<T>(read: () => T): T {
  try {
    return read();
  } catch (error) {
    if (isZcashError(error) && error.code === 'RESOURCE_LIMIT') throw error;
    throw protocol();
  }
}

/** Owned adapter transport only; returned PCZT bytes are not verified authorization.
 * The adapter owns cleanup of undelivered account results after cancellation. */
export function createCustomSigner(adapter: Signer): Signer {
  return boundedSigner(adapter, Number.MAX_SAFE_INTEGER);
}
const adapters = new WeakMap<
  Signer,
  { adapter: Signer; methods: Record<keyof Signer, (...args: never[]) => unknown> }
>();
/** Wallet admission must bound the original adapter response before any wrapper copies it. */
export function boundedSigner(adapter: Signer, maximum: number): Signer {
  const captured = adapters.get(adapter);
  adapter = captured?.adapter ?? adapter;
  // Methods may be prototype data properties on a stateful device adapter.
  const methods = captured?.methods ?? {} as Record<keyof Signer, (...args: never[]) => unknown>;
  try {
    if (!adapter || typeof adapter !== 'object') throw 0;
    for (const name of captured ? [] : ['getCapabilities', 'getAccount', 'authorize'] as const) {
      let owner: object | null = adapter,
        property: PropertyDescriptor | undefined;
      const seen = new Set<object>();
      while (owner && !property) {
        if (seen.has(owner)) throw 0;
        seen.add(owner);
        property = Object.getOwnPropertyDescriptor(owner, name);
        owner = Object.getPrototypeOf(owner);
      }
      if (!property || !Object.hasOwn(property, 'value') || typeof property.value !== 'function') throw 0;
      methods[name] = property.value;
    }
  } catch {
    throw invalidArgument();
  }
  async function invoke<T>(
    method: (...args: never[]) => unknown,
    args: object,
    signal: AbortSignal | undefined,
    read: (value: unknown) => T,
  ): Promise<T> {
    const pending = operation(signal);
    try {
      pending.check();
      const value: unknown = await pending.wait(Reflect.apply(method, adapter, [{ ...args, signal: pending.signal }]));
      pending.check();
      const result = response(() => read(value));
      pending.check();
      return result;
    } catch (error) {
      pending.check();
      throw isZcashError(error) ? error : rejected();
    } finally {
      pending.close();
    }
  }
  const signer = Object.freeze({
    async getCapabilities(args = {}) {
      const input = snapshot(args, ['signal']);
      return invoke(methods.getCapabilities, {}, input.signal, signerCapabilities);
    },
    async getAccount(args) {
      const input = snapshot(args, ['network', 'selector', 'signal']);
      const bound = networkBinding(input.network);
      const selector = snapshot(input.selector, ['kind', 'accountIndex', 'keyId', 'fingerprint']);
      let selected;
      if (selector.kind === 'derived') {
        if (Object.keys(selector).length !== 2) throw invalidArgument();
        selected = { kind: 'derived', accountIndex: accountIndex(selector.accountIndex) };
      } else if (selector.kind === 'imported') {
        if (Object.keys(selector).length !== 2) throw invalidArgument();
        selected = { kind: 'imported', keyId: text(selector.keyId) };
      } else if (selector.kind === 'fingerprint') {
        if (Object.keys(selector).length !== 2
          || typeof selector.fingerprint !== 'string'
          || !/^[0-9a-f]{64}$/.test(selector.fingerprint)) throw invalidArgument();
        selected = { kind: 'fingerprint', fingerprint: selector.fingerprint };
      } else throw invalidArgument();
      return invoke(methods.getAccount, { network: input.network, selector: selected }, input.signal, (value) => {
        const account = checkedAccountDescriptor(value);
        if (networkBinding(account.network).definition.binding !== bound.definition.binding) throw protocol();
        return account;
      });
    },
    async authorize(args) {
      const { request, signal } = signingRequest(args, maximum);
      return invoke(methods.authorize, request, signal, (value) => {
        const result = snapshot(value, ['requestId', 'pczt']);
        if (result.requestId !== request.requestId) throw protocol();
        return { requestId: result.requestId, pczt: ownBytes(result.pczt, protocol, limit, maximum) };
      });
    },
  } satisfies Signer);
  adapters.set(signer, { adapter, methods });
  return signer;
}

/** Internal admission shared by adapter and native memory authorities. */
export function signingRequest(args: Parameters<Signer['authorize']>[0], maximum = Number.MAX_SAFE_INTEGER) {
  const input = snapshot(
    args,
    ['requestId', 'pczt', 'context', 'accountIds', 'capabilityRevision', 'reviewCommitment', 'signal'],
  );
  const context = snapshot(input.context, ['network', 'targetHeight', 'branchId']);
  networkBinding(context.network);
  uint(context.targetHeight);
  uint(context.branchId);
  const ids = list(input.accountIds, text);
  if (!ids.length) throw invalidArgument();
  const request = {
    requestId: text(input.requestId),
    pczt: ownBytes(input.pczt, invalidArgument, limit, maximum),
    context,
    accountIds: ids,
    capabilityRevision: text(input.capabilityRevision),
    reviewCommitment: text(input.reviewCommitment),
  };
  return { request, signal: input.signal };
}
