import type { ArtifactManifest } from '../../docs/api/public-api.js';

/** Internal baseline wallet profile; not the completed H1 operation surface. */
export const walletProfile = {
  contractRevision: 'zakura-private-wallet/1', abiVersion: 'checked-bindgen-0.2.128/1',
  schemas: {
    operations: { walletViews: '4', walletSigner: '2', walletProposals: '1', walletScan: '1', walletSync: '2', walletEnhancement: '1', walletQueries: '2', consensusContext: '1', decodeTransaction: '1' },
    protobuf: 'not-used', networkParameters: 'zcash-js-network/1', database: 'wallet-storage/3',
    hostServices: { nodeFilesystem: 'linux-flock/1', browserOpfs: 'sync-access-handle/1', storage: 'scalar-vfs/1' },
  },
} as const;
export interface WalletRuntimeIdentity extends Pick<ArtifactManifest,
  'contractRevision' | 'abiVersion' | 'schemas' | 'buildSha256' | 'dependencyGraphSha256' | 'mode'> {
  readonly memory: { readonly initialPages: number; readonly maximumPages: number; readonly shared: false };
}

// These records contain only version strings/maps; compare independent key ordering.
export function sameRecord(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const left = Object.keys(a), right = Object.keys(b);
  return left.length === right.length && left.every(key => Object.hasOwn(b, key)
    && sameRecord((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}
