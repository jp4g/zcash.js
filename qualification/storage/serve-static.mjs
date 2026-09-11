import fs from 'node:fs';
import path from 'node:path';
export function serveStatic(base, req, res) {
  const name = req.url === '/' ? 'browser-test.html' : req.url.slice(1);
  if (name.includes('/') || !/^[a-zA-Z0-9_.-]+$/.test(name)) { res.writeHead(404).end(); return; }
  let body;
  try { body = fs.readFileSync(`${base}/${name}`); }
  catch { res.writeHead(404).end(); return; }
  const type = { '.mjs': 'text/javascript', '.js': 'text/javascript', '.wasm': 'application/wasm', '.html': 'text/html' }[path.extname(name)];
  res.writeHead(200, { 'Content-Type': type ?? 'text/plain', 'Cache-Control': 'no-store' }); res.end(body);
}
