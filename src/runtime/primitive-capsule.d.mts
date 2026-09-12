export function initialize(): void;
export function consensusContext(format: string, parameters: Uint8Array, height: number): Readonly<{ height: number; branchId: number }>;
export function decodeTransaction(bytes: Uint8Array, branch: number): Readonly<{ bytes: Uint8Array; txid: Uint8Array; display: string }>;
