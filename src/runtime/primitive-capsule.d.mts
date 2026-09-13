export function initialize(): void;
export function consensusContext(format: string, parameters: Uint8Array, height: number): Readonly<{ height: number; branchId: number }>;
export function decodeTransaction(bytes: Uint8Array, branch: number): Readonly<{ bytes: Uint8Array; txid: Uint8Array; display: string }>;
/** Native-owned viewing authority; disposal releases its allocation. */
export interface ViewingAuthority {
  describe(): { kind: 'ufvk' | 'uivk'; components: import('../../docs/api/public-api.js').ReceiverType[]; enabledPools: import('../../docs/api/public-api.js').Pool[]; provenance: null };
  export(format: string, acknowledge: string): string;
  toIncoming(): ViewingAuthority;
  derive(index: string, request: string): Omit<import('../../docs/api/public-api.js').AddressRecord, 'index'> & { index: string };
  find(index: string, request: string, maxAttempts: number): Omit<import('../../docs/api/public-api.js').AddressRecord, 'index'> & { index: string };
  dispose(): void;
}
export function openViewingAuthority(parameters: Uint8Array, format: string, encoded: string, pools: string): ViewingAuthority;
export function decodeViewingAddress(parameters: Uint8Array, encoded: string): Omit<import('../../docs/api/public-api.js').DecodedAddress, 'network'>;
export function selectViewingReceiver(parameters: Uint8Array, encoded: string, pool: string, height: number, branch: number): import('../../docs/api/public-api.js').SelectedReceiver;
/** Candidate native birthday validator; requires matching capsule qualification. */
export function validateBirthday(parameters: Uint8Array, genesis: Uint8Array, first: number, tree: Uint8Array, recover?: number): void;
