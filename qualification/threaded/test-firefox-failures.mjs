// Socket-free fault injection against the runner's actual logging and cleanup code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

test('log rejection during an active wait aborts and disposes all resources', async () => {
  const source = await readFile(new URL('./run-firefox.mjs', import.meta.url), 'utf8');
  const logging = source.slice(source.indexOf('let logWrites'), source.indexOf('const stop ='));
  const cleanup = source.slice(source.indexOf('  clearTimeout(deadline);'), source.lastIndexOf('\n}'));
  const temp = await mkdtemp(join('/home/jack/zcash-threaded-scratch', 'firefox-log-control-'));
  const script = `
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
const records = [], logPath = '', resultPath = '', driverPath = '', runRoot = '', id = '';
const events = [], results = [], capabilities = {}, manifest = {};
const stop = new AbortController(), deadline = setTimeout(() => {}, 5000), onSignal = () => {};
let exitCode = 0, driverText = '', disposed = [];
const appendFile = async () => { throw Error('injected log failure'); };
const writeFile = async () => {};
const request = async () => { disposed.push('session'); };
const session = 'synthetic', driver = {pid: 123}, driverExit = Promise.resolve();
const socket = {close() { disposed.push('socket'); }}, rejectPending = () => {};
const browserIdentity = {pid: 456, startTime: '1'};
const processIdentity = async () => { disposed.push('browser'); return null; };
const delay = async () => {};
const server = {listening: true, closeAllConnections() {}, close(cb) { this.listening = false; disposed.push('server'); cb(); }};
const realKill = process.kill;
process.kill = (pid, signal) => { if (pid !== -123) return realKill(pid, signal); disposed.push('driver'); const e = Error(); e.code = 'ESRCH'; throw e; };
${logging}
try {
  record({stage: 'active'});
  await new Promise((resolve, reject) => {
    stop.signal.addEventListener('abort', () => reject(stop.signal.reason), {once:true});
    setTimeout(() => reject(Error('active wait did not abort')), 1000).unref();
  });
} catch (error) { assert.match(String(error), /injected log failure/); exitCode = 1; }
finally {
${cleanup}
}
assert.equal(exitCode, 1);
for (const resource of ['session', 'socket', 'driver', 'browser', 'server']) assert(disposed.includes(resource), resource);
assert(records.some(r => r.stage === 'cleanup'));
writeFileSync(${JSON.stringify(join(temp, 'disposed'))}, 'CLEANUP-DISPOSED');
`;
  const path = join(temp, 'control.mjs');
  await writeFile(path, script);
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const child = await new Promise((resolve, reject) => {
    const process = spawn(globalThis.process.execPath, [path], { env, timeout: 4000 });
    let stdout = '', stderr = '';
    process.stdout.on('data', bytes => { stdout += bytes; });
    process.stderr.on('data', bytes => { stderr += bytes; });
    process.on('error', reject);
    process.on('close', status => resolve({ status, stdout, stderr }));
  });
  assert.equal(child.status, 1, child.stderr);
  assert.equal(await readFile(join(temp, 'disposed'), 'utf8'), 'CLEANUP-DISPOSED');
});
