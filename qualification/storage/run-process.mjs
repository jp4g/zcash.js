import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { start } from './node-harness.mjs';
const root = fs.mkdtempSync('/home/jack/zcash-storage-scratch/process-');
const processes = new Set(), workers = new Set();
// GNU timeout sends SIGTERM before SIGKILL. Synchronous exit cleanup also covers
// uncaught exceptions, so detached fixture children cannot outlive this runner.
process.on('exit', () => {
  for (const child of processes) {
    if (child.pid && child.exitCode === null && child.signalCode === null) {
      try { process.kill(-child.pid, 'SIGKILL'); } catch {}
    }
  }
});
process.on('SIGTERM', () => process.exit(143));
process.on('SIGINT', () => process.exit(130));
function launch(mode) {
  const result = `${root}/${mode}.json`;
  const log = fs.openSync(`${root}/${mode}.log`, 'wx');
  const process = spawn(globalThis.process.execPath, [fileURLToPath(new URL('./process-owner.mjs', import.meta.url)), root, result, mode], { detached: true, stdio: ['ignore', log, log] });
  fs.closeSync(log); processes.add(process);
  process.on('error', e => { process.launchError = e; });
  return { process, result };
}
async function signalFile(child) {
  const deadline = Date.now() + 20000;
  for (;;) {
    if (child.process.launchError) throw child.process.launchError;
    if (fs.existsSync(child.result)) return JSON.parse(fs.readFileSync(child.result));
    if (Date.now() >= deadline) throw Error('external process startup timeout');
    await new Promise(r => setTimeout(r, 20));
  }
}
async function kill(child) {
  if (child.exitCode !== null || child.signalCode !== null) { processes.delete(child); return; }
  const exited = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('process exit timeout')), 5000);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
  });
  process.kill(-child.pid, 'SIGKILL'); await exited; processes.delete(child);
}
try {
  let worker = start(root, true); workers.add(worker);
  for (const op of ['open', 'seed', 'close']) assert.equal((await worker.call({ op })).rc, 0);
  await worker.destroy(); workers.delete(worker);
  const owner = launch('owner'); const ready = await signalFile(owner); assert.equal(ready.updated.rc, 0);
  const contender = launch('contend'); const rejected = await signalFile(contender); assert.equal(rejected.code, 'EBUSY');
  // The owner lock cannot be stolen even though another whole process opens it.
  assert.equal(fs.statSync(`${root}/owner.lock`).isFile(), true);
  await kill(owner.process);
  worker = start(root); workers.add(worker);
  const disk = await worker.call({ op: 'inspect' });
  assert.deepEqual(disk['wallet.db-journal'].header, [217, 213, 5, 249, 32, 161, 99, 215]);
  for (const op of ['open', 'verify', 'close']) assert.equal((await worker.call({ op })).rc, 0);
  console.log(JSON.stringify({ pass: true, test: 'cross-process-owner-exclusion-SIGKILL-hot-journal-reopen', root, ready, rejected, disk, lockFileRetained: fs.existsSync(`${root}/owner.lock`), powerLoss: false }));
} finally {
  await Promise.all([...workers].map(w => w.destroy()));
  await Promise.all([...processes].map(kill));
}
