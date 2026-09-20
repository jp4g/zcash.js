import type { LocalProvingOptions } from '../types.js';
import { failure } from '../errors.js';
import { saplingAssets } from '../wallet/proving-assets.js';
import { bundledUrls } from './bundled-assets.mjs';
import { packageAsset } from './package-assets.js';

export function packageProving(): LocalProvingOptions {
  return {
    kind: 'local',
    assets: saplingAssets.map(({ sha256, blake2b512: _unused, ...asset }) => {
      void _unused;
      return { ...asset, digest: { algorithm: 'sha256', hex: sha256 } };
    }),
    cache: { kind: 'memory', maxBytes: saplingAssets.reduce((sum, asset) => sum + asset.byteLength, 0) },
    maxConcurrentProofs: 1,
    async loadAsset({ requirement, signal }) {
      const url = bundledUrls()[`proving/${requirement.assetId}`];
      if (!url) throw failure('ASSET_UNAVAILABLE', 'proving', 'configure', 'Unknown proving asset.');
      const response = await packageAsset(url.href, signal ?? new AbortController().signal);
      if (!response.ok || !response.body) {
        throw failure('ASSET_UNAVAILABLE', 'proving', 'configure', 'Package proving asset unavailable.');
      }
      const reader = response.body.getReader();
      const bytes = new Uint8Array(requirement.byteLength);
      let size = 0;
      try {
        for (;;) {
          signal?.throwIfAborted();
          const chunk = await reader.read();
          if (chunk.done) break;
          if (chunk.value.length > bytes.length - size) {
            throw failure('ASSET_INTEGRITY', 'proving', 'configure', 'Package proving asset size mismatch.');
          }
          bytes.set(chunk.value, size);
          size += chunk.value.length;
        }
        return bytes.subarray(0, size);
      } finally {
        void reader.cancel().catch(() => {});
        reader.releaseLock();
      }
    },
  };
}
