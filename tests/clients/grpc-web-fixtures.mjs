// Synthetic opaque payloads: no protobuf DTO or network identity claim.
export const media = 'application/grpc-web-text+proto';
export const service = '/cash.z.wallet.sdk.rpc.CompactTxStreamer/';
export const unaryMethods = ['GetLatestBlock', 'GetLightdInfo', 'GetTransaction', 'GetAddressUtxos',
  'GetTaddressBalance', 'GetTreeState', 'SendTransaction'];
export const streamMethods = ['GetSubtreeRoots', 'GetBlockRange', 'GetTaddressTransactions', 'GetMempoolStream'];
export function frame(bytes, flag = 0) {
  const result = new Uint8Array(5 + bytes.length);
  result[0] = flag;
  new DataView(result.buffer).setUint32(1, bytes.length);
  result.set(bytes, 5);
  return result;
}
export function concat(...arrays) {
  const result = new Uint8Array(arrays.reduce((sum, array) => sum + array.length, 0));
  let offset = 0;
  for (const array of arrays) { result.set(array, offset); offset += array.length; }
  return result;
}
export const trailer = (text = 'grpc-status: 0\r\n') => frame(new TextEncoder().encode(text), 128);
export function base64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
export const good = () => base64(concat(frame(new Uint8Array([8, 1])), trailer()));

export async function serveFixtures(assets = new Map(), { signal, onCreate } = {}) {
  const { createServer } = await import('node:http');
  signal?.throwIfAborted();
  const requests = [], closed = [], served = [], timers = new Set();
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'GET' && assets.has(url.pathname)) {
        served.push(url.pathname);
        res.writeHead(200, { 'content-type': url.pathname === '/' ? 'text/html' : 'text/javascript' });
        res.end(assets.get(url.pathname)); return;
      }
      if (req.method !== 'POST' || !url.pathname.startsWith(service)) { res.writeHead(404).end(); return; }
      let body = '';
      for await (const chunk of req) { body += chunk; if (body.length > 8 * 1024 * 1024) throw Error('fixture request too large'); }
      const mode = url.searchParams.get('case') ?? 'good';
      requests.push({ path: url.pathname, mode, body, headers: req.headers });
      res.on('close', () => closed.push(mode));
      const headers = { 'content-type': media };
      if (mode.startsWith('headers')) headers['grpc-status'] = mode === 'headers-error' ? '5' : '0';
      res.writeHead(mode === 'http-error' ? 503 : 200, headers);
      if (mode.startsWith('headers')) { res.end(); return; }
      if (mode === 'stall') { res.write(base64(frame(new Uint8Array([8, 1])))); return; }
      let text = good();
      if (mode === 'fragmented') {
        const bytes = concat(frame(new Uint8Array([1, 2, 3])), frame(new Uint8Array([4])), trailer());
        text = '';
        for (let i = 0; i < bytes.length; i += 2) text += base64(bytes.subarray(i, i + 2));
      }
      if (mode === 'error') text = base64(trailer('grpc-status: 5\r\ngrpc-message: private-server-secret\r\n'));
      if (mode === 'missing') text = base64(frame(new Uint8Array([1])));
      if (mode === 'truncated') text = good().slice(0, -5);
      if (mode === 'compressed') text = base64(concat(frame(new Uint8Array([1]), 1), trailer()));
      if (mode === 'duplicate') text = base64(trailer('grpc-status: 0\r\ngrpc-status: 0\r\n'));
      if (mode === 'fragmented') {
        let offset = 0;
        const write = () => {
          if (res.destroyed) return;
          if (offset === text.length) { res.end(); return; }
          res.write(text.slice(offset, ++offset));
          const timer = setTimeout(() => { timers.delete(timer); write(); }, 1);
          timers.add(timer);
        };
        write();
      } else res.end(text);
    } catch { res.destroy(); }
  });
  let closing;
  const fixture = { requests, closed, served,
    close() {
      return closing ??= (async () => {
        for (const timer of timers) clearTimeout(timer);
        server.closeAllConnections();
        await new Promise((resolve, reject) => server.close(error => {
          if (error && error.code !== 'ERR_SERVER_NOT_RUNNING') reject(error); else resolve();
        }));
      })();
    } };
  // Publish ownership before listen: callers can tear down pending acquisition.
  onCreate?.(fixture);
  await new Promise((resolve, reject) => {
    const aborted = () => reject(signal.reason);
    const failed = error => { signal?.removeEventListener('abort', aborted); reject(error); };
    server.once('error', failed);
    if (signal?.aborted) { reject(signal.reason); return; }
    signal?.addEventListener('abort', aborted, { once: true });
    server.listen({ port: 0, host: '127.0.0.1', signal }, () => {
      signal?.removeEventListener('abort', aborted);
      resolve();
    });
  });
  fixture.origin = `http://127.0.0.1:${server.address().port}`;
  return fixture;
}
