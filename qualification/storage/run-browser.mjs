// Coordinator host execution required: this worker sandbox denies socket creation.
import http from 'node:http';
import fs from 'node:fs';
import { serveStatic } from './serve-static.mjs';
import { spawn } from 'node:child_process';
const base = '/home/jack/zcash-storage-scratch/bundle';
const log = '/home/jack/zcash-storage-logs';
const profile = fs.mkdtempSync('/home/jack/zcash-storage-scratch/chrome-');
const chromeLog = fs.openSync(`${log}/browser-chrome-${Date.now()}.log`, 'wx');
let chrome;
const server = http.createServer((req, res) => {
  if (req.url === '/result' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 4000000) req.destroy(); });
    req.on('end', () => {
      try {
        const result = JSON.parse(body);
        fs.writeFileSync(`${log}/browser-result-${Date.now()}.json`, JSON.stringify(result, null, 2));
        console.log(JSON.stringify({ pass: result.pass, tests: result.results?.length, error: result.error, profile }));
        res.end('recorded'); finish(result.pass ? 0 : 1);
      } catch (e) { console.error(e); res.writeHead(500).end(); finish(1); }
    });
    return;
  }
  serveStatic(base, req, res);
});
let finishing = false;
const timer = setTimeout(() => { console.error('external browser suite timeout'); finish(1); }, 180000);
function finish(code) {
  if (finishing) return; finishing = true; clearTimeout(timer);
  if (chrome?.pid) { try { process.kill(-chrome.pid, 'SIGKILL'); } catch {} }
  server.closeAllConnections(); server.close(); fs.closeSync(chromeLog); process.exitCode = code;
}
server.on('error', e => { console.error(e); finish(1); });
process.on('uncaughtException', e => { console.error(e); finish(1); });
process.on('unhandledRejection', e => { console.error(e); finish(1); });
process.on('SIGTERM', () => finish(143)); process.on('SIGINT', () => finish(130));
server.listen(0, '127.0.0.1', () => {
  chrome = spawn('/home/jack/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome', [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--user-data-dir=${profile}`, `http://127.0.0.1:${server.address().port}/`,
  ], { detached: true, stdio: ['ignore', chromeLog, chromeLog] });
  chrome.on('error', e => { console.error(e); finish(1); });
  chrome.on('exit', code => { if (!finishing) { console.error(`Chrome exited ${code}`); finish(1); } });
});
