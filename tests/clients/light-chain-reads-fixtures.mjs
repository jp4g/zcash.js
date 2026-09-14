import { concat, frame, trailer, base64, media, service } from './grpc-web-fixtures.mjs';
export { concat, frame, trailer, base64, media, service };
export const revision = 'lightwire:80575dbe59a9bf2e6b79e2391eb78679c453f1a0477292eb97ea3b58bb6c8b10:d8d0c8aaa5ceec7d5dcc188ef25b04011df2ec0254901620fce982fc13aeb32d';
export const hash = Uint8Array.from({ length: 32 }, (_, i) => i);
export const nextHash = Uint8Array.from({ length: 32 }, (_, i) => i + 32);
export const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
export const display = bytes => hex(Uint8Array.from(bytes).reverse());
// Test-only protobuf fields, from the pinned service.proto BlockID and compact_formats.proto.
export function varint(n) {
  n = BigInt(n); const bytes = [];
  do { bytes.push(Number(n & 127n) | (n > 127n ? 128 : 0)); n >>= 7n; } while (n);
  return Uint8Array.from(bytes);
}
export const scalar = (field, n) => concat(varint(field * 8), varint(n));
export const bytesField = (field, bytes) => concat(varint(field * 8 + 2), varint(bytes.length), bytes);
export const tipBytes = (height = 7, h = hash) => concat(scalar(1, height), bytesField(2, h));
export const blockBytes = (height = 7, h = hash, prev = nextHash, extra = new Uint8Array()) =>
  concat(scalar(2, height), bytesField(3, h), bytesField(4, prev), extra);
export const response = (...items) => new Response(base64(concat(...items.map(b => frame(b)), trailer())), { headers: { 'content-type': media } });

// Load the committed native build only after verifying its receipt and artifact hashes.
export async function acceptedArtifacts() {
  const { nativeFixture, readFixture } = await import('../support/fixtures.mjs');
  const accepted = nativeFixture('lightwire');
  const assets = new Map([...accepted.assets].map(([path, bytes]) => ['/codec/' + path, bytes]));
  const goldenBytes = readFixture('lightwire/golden.json');
  assets.set('/golden.json', goldenBytes);
  return { assets, golden: JSON.parse(goldenBytes), build: accepted.directory, provenance: accepted.provenance };
}
export async function fixtureCodec() {
  const accepted = await acceptedArtifacts();
  const { createLightwire } = await import(accepted.build + '/codec.mjs');
  return { ...accepted, codec: createLightwire(accepted.assets.get('/codec/wasm/zakura_lightwire_bg.wasm')) };
}

export async function serveChainFixtures(assets = new Map(), { signal, onCreate, golden } = {}) {
  const { createServer } = await import('node:http');
  const requests = [], closed = [], served = [], timers = new Set();
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'GET' && assets.has(url.pathname)) {
        served.push(url.pathname);
        res.writeHead(200, { 'content-type': url.pathname === '/' ? 'text/html' : url.pathname.endsWith('.wasm') ? 'application/wasm' : 'text/javascript' });
        res.end(assets.get(url.pathname)); return;
      }
      if (req.method !== 'POST' || ![service + 'GetLatestBlock', service + 'GetBlockRange'].includes(url.pathname)) { res.writeHead(404).end(); return; }
      let body = '';
      for await (const chunk of req) { body += chunk; if (body.length > 1024) throw Error('fixture request bound'); }
      const mode = url.searchParams.get('case') ?? 'good';
      requests.push({ path: url.pathname, mode, body, headers: req.headers });
      res.on('close', () => closed.push(mode));
      res.writeHead(200, { 'content-type': media });
      const tip = url.pathname.endsWith('GetLatestBlock');
      let items = tip ? [tipBytes()] : [blockBytes(), blockBytes(8, nextHash, hash)];
      if (mode === 'overflow32') items = [tip ? tipBytes(4294967296n) : blockBytes(4294967296n)];
      if (mode === 'overflow53') items = [tip ? tipBytes(9007199254740993n) : blockBytes(9007199254740993n)];
      if (mode === 'default') items = [new Uint8Array()];
      if (mode === 'malformed') items = [new Uint8Array([128])];
      if (mode === 'short-hash') items = [tip ? tipBytes(7, new Uint8Array(31)) : blockBytes(7, new Uint8Array(31))];
      if (mode === 'short-prev') items = [blockBytes(7, hash, new Uint8Array(31))];
      if (mode === 'partial' || mode === 'stall') items = items.slice(0, 1);
      if (mode === 'empty') items = [];
      if (mode === 'order') items.reverse();
      if (mode === 'link') items[1] = blockBytes(8);
      if (mode === 'extra') items.push(blockBytes(9, hash, nextHash));
      if (mode === 'owned') items[0] = blockBytes(7, hash, nextHash,
        concat(bytesField(8, scalar(3, 19)), bytesField(99, new Uint8Array([1, 2, 3]))));
      if (mode === 'golden') {
        const vector = golden.find(v => v.method === 'GetBlockRange' && v.direction === 'item');
        items[0] = concat(Uint8Array.from(vector.hex.match(/../g), h => parseInt(h, 16)), scalar(2, 7), bytesField(99, new Uint8Array([42])));
      }
      if (mode === 'stall') { res.write(base64(frame(items[0]))); return; }
      const terminal = mode === 'missing' ? new Uint8Array() : mode === 'error'
        ? trailer('grpc-status: 13\r\ngrpc-message: private-secret\r\n') : trailer();
      const text = base64(concat(...items.map(item => frame(item)), terminal));
      if (mode !== 'fragmented') { res.end(text); return; }
      let offset = 0;
      const write = () => {
        if (res.destroyed) return;
        if (offset === text.length) { res.end(); return; }
        res.write(text.slice(offset, ++offset));
        const timer = setTimeout(() => { timers.delete(timer); write(); }, 1); timers.add(timer);
      };
      write();
    } catch { res.destroy(); }
  });
  let closing;
  const fixture = { requests, closed, served, close() {
    return closing ??= (async () => {
      for (const timer of timers) clearTimeout(timer);
      server.closeAllConnections();
      await new Promise((resolve, reject) => server.close(error => {
        if (error && error.code !== 'ERR_SERVER_NOT_RUNNING') reject(error); else resolve();
      }));
    })();
  } };
  onCreate?.(fixture);
  await new Promise((resolve, reject) => {
    const aborted = () => reject(signal.reason);
    server.once('error', error => { signal?.removeEventListener('abort', aborted); reject(error); });
    if (signal?.aborted) { reject(signal.reason); return; }
    signal?.addEventListener('abort', aborted, { once: true });
    server.listen({ port: 0, host: '127.0.0.1', signal }, () => {
      signal?.removeEventListener('abort', aborted); resolve();
    });
  });
  fixture.origin = `http://127.0.0.1:${server.address().port}`;
  return fixture;
}
