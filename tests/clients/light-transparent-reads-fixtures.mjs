import { concat, frame, trailer, base64, media, service } from './grpc-web-fixtures.mjs';
export { concat, frame, trailer, base64, media, service };
export const revision = 'lightwire:80575dbe59a9bf2e6b79e2391eb78679c453f1a0477292eb97ea3b58bb6c8b10:d8d0c8aaa5ceec7d5dcc188ef25b04011df2ec0254901620fce982fc13aeb32d';
export const hash = Uint8Array.from({ length: 32 }, (_, i) => i);
// Test-only protobuf fields, from the pinned service.proto BlockID and compact_formats.proto.
export function varint(n) {
  n = BigInt(n); const bytes = [];
  do { bytes.push(Number(n & 127n) | (n > 127n ? 128 : 0)); n >>= 7n; } while (n);
  return Uint8Array.from(bytes);
}
export const scalar = (field, n) => concat(varint(field * 8), varint(n));
export const bytesField = (field, bytes) => concat(varint(field * 8 + 2), varint(bytes.length), bytes);
// Fixture-only direct import of the accepted artifact, after exact source/build closure binding.
export async function acceptedArtifacts() {
 const {readFileSync}=await import('node:fs'); const {createHash}=await import('node:crypto');
 const root='/home/jack/zcash-light-transparent-reads-scratch';
 const provenance=JSON.parse(readFileSync(root+'/artifacts.json'));
 const assets=new Map();
 for(const [path,digest] of Object.entries(provenance)) {
  const bytes=readFileSync(path); if(createHash('sha256').update(bytes).digest('hex')!==digest) throw Error('artifact hash mismatch');
  assets.set(path.slice(root.length),bytes);
 }
 return {assets,provenance};
}
export const token='t1Hsc1LR8yKnbbe3twRp88p6vFfC5t7DLbs';
export const utxoBytes=()=>bytesField(1,concat(bytesField(1,hash),scalar(2,2),bytesField(3,new Uint8Array([81])),scalar(4,9007199254740993n),scalar(5,7),bytesField(6,new TextEncoder().encode(token))));
export async function serveTransparentFixtures(assets = new Map(), { signal, onCreate } = {}) {
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
      if (req.method !== 'POST' || ![service + 'GetTaddressBalance', service + 'GetAddressUtxos'].includes(url.pathname)) { res.writeHead(404).end(); return; }
      let body = '';
      for await (const chunk of req) { body += chunk; if (body.length > 1024) throw Error('fixture request bound'); }
      const mode = url.searchParams.get('case') ?? 'good';
      requests.push({ path: url.pathname, mode, body, headers: req.headers });
      res.on('close', () => closed.push(mode));
      res.writeHead(200, { 'content-type': media });
      const tip = url.pathname.endsWith('GetTaddressBalance');
      let items = [tip ? scalar(1,9007199254740993n) : utxoBytes()];
      // Pinned service.go:929–939,984–996 erases unmatched backend errors into this UTXO success.
      // Source-derived wire consequence only; no Go execution or balance marshaling claim.
      if (mode === 'default' || (mode === 'suppressed-utxo-error' && !tip)) items = [new Uint8Array()];
      if (mode === 'malformed') items = [new Uint8Array([128])];
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
