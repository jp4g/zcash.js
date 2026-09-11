import assert from 'node:assert/strict';
import { serveStatic } from './serve-static.mjs';
const base = '/home/jack/zcash-storage-scratch/stage-1/bundle';
for (const [url, expected] of [['/favicon.ico', 404], ['/missing.js', 404], ['/../storage.js', 404], ['/storage.js', 200], ['/', 200]]) {
  let writes = 0, ended = false;
  const response = {
    writeHead(status) { assert.equal(++writes, 1, 'headers written only once'); assert.equal(status, expected); return this; },
    end(body) { assert.equal(ended, false); ended = true; if (expected === 200) assert.ok(body.length > 0); },
  };
  serveStatic(base, { url }, response); assert.equal(writes, 1); assert.ok(ended);
}
console.log('PASS missing favicon/read failure returns one 404; real assets still served');
