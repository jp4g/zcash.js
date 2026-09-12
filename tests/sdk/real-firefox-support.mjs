import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
export const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export const claims = ['packed-esm', 'packed-bundle', 'amounts-ids', 'no-eager', 'negative-eager',
  'negative-unsupported', 'precision-utf8', 'deadline', 'abort', 'invalid-utf8', 'rpc-error-no-retry', 'public-network','public-light','public-client','public-viewing'];
export function verifyAssets(manifest, assets) {
  assert.equal(assets.size, Object.keys(manifest.files).length, 'asset integrity count');
  for (const [name, expected] of Object.entries(manifest.files)) {
    const bytes = assets.get(name);
    assert.ok(bytes && bytes.length === expected.bytes && sha(bytes) === expected.sha256, `asset integrity: ${name}`);
  }
}
export function verifyResult(result) {
  assert.deepEqual(result?.claims, claims, 'browser claims incomplete');
  assert.equal(result.ok, true);
  assert.deepEqual(result.viewing, Array.from({length:2},()=>({operations:7,independentAuthorities:3,cancelled:2,unknownReceivers:true})));
  assert.deepEqual(result.publicClients,[{methods:11,cancelled:1,broadcastUnknown:1},{methods:11,cancelled:1,broadcastUnknown:1}]);
  assert.deepEqual(result.light,[{methods:11,cancelled:2,broadcastUnknown:1},{methods:11,cancelled:2,broadcastUnknown:1}]);
  assert.deepEqual(result.eager, { Worker: 0, SharedWorker: 0, WebAssembly: 0, fetch: 0, XMLHttpRequest: 0, WebSocket: 0, EventSource: 0 });
  assert.equal(result.precision, '9007199254740993');
  assert.equal(result.utf8, '€雪😀');
  assert.equal(result.negativeEager, 1);
  assert.deepEqual(result.network, { modules: 2, instances: 2, fetches: 0, workers: 0, descriptors: 2, cancelled: 4 });
}
