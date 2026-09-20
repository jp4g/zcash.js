import { bundledUrls } from './bundled-assets.mjs';
import { failure } from '../errors.js';

/** Reads only the package's statically enumerated assets; no caller-supplied file URLs. */
export async function packageAsset(url: string, signal: AbortSignal): Promise<Response> {
  const entry = Object.entries(bundledUrls()).find(([, value]) => value.href === url);
  if (!entry) throw failure('ASSET_UNAVAILABLE', 'runtime', 'configure', 'Unknown package asset.');
  signal.throwIfAborted();
  if (entry[1].protocol !== 'file:') {
    return fetch(url, { signal, credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer' });
  }
  const builtin = (globalThis as {
    process?: { getBuiltinModule?(name: string): unknown };
  }).process?.getBuiltinModule;
  const fs = builtin?.('node:fs') as typeof import('node:fs') | undefined;
  const stream = builtin?.('node:stream') as typeof import('node:stream') | undefined;
  if (!fs || !stream) throw failure('ASSET_UNAVAILABLE', 'runtime', 'configure', 'Package filesystem unavailable.');
  const type = entry[0].endsWith('.wasm')
    ? 'application/wasm'
    : entry[0].endsWith('.mjs') ? 'text/javascript' : 'application/octet-stream';
  const body = stream.Readable.toWeb(fs.createReadStream(entry[1], { signal })) as ReadableStream<Uint8Array>;
  return new Response(body, { headers: { 'content-type': type } });
}
