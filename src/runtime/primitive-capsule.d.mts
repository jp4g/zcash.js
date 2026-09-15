export function initialize(): void;
export function consensusContext(format: string, parameters: Uint8Array, height: number): Readonly<{ height: number; branchId: number }>;
export function decodeTransaction(bytes: Uint8Array, branch: number): Readonly<{ bytes: Uint8Array; txid: Uint8Array; display: string }>;
/** Native-owned viewing authority; disposal releases its allocation. */
export interface ViewingAuthority {
  describe(): { kind: 'ufvk' | 'uivk'; components: import('../types.js').ReceiverType[]; enabledPools: import('../types.js').Pool[]; provenance: null };
  export(format: string, acknowledge: string): string;
  toIncoming(): ViewingAuthority;
  derive(index: string, request: string): Omit<import('../types.js').AddressRecord, 'index'> & { index: string };
  find(index: string, request: string, maxAttempts: number): Omit<import('../types.js').AddressRecord, 'index'> & { index: string };
  dispose(): void;
}
export function openViewingAuthority(parameters: Uint8Array, format: string, encoded: string, pools: string): ViewingAuthority;
export function decodeViewingAddress(parameters: Uint8Array, encoded: string): Omit<import('../types.js').DecodedAddress, 'network'>;
export function selectViewingReceiver(parameters: Uint8Array, encoded: string, pool: string, height: number, branch: number): import('../types.js').SelectedReceiver;

export function validateBirthday(parameters: Uint8Array, genesis: Uint8Array, first: number, tree: Uint8Array, recover?: number): void;

export interface StandalonePczt {
  serialize(): Uint8Array;
  inspect(): Omit<import('../types.js').PcztInspection, 'context'> & { targetHeight: number; branchId: number };
  combine(other: StandalonePczt): StandalonePczt;
  redact(profile: string): StandalonePczt;
  dispose(): void;
}
export function parseStandalonePczt(parameters: Uint8Array, genesis: Uint8Array, height: number, branch: number, bytes: Uint8Array, maximum: number): StandalonePczt;
