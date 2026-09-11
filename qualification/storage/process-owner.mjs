// Separate OS process with an actual dedicated SQLite worker. Signals via files
// keep this control independent of sandbox-denied IPC socket creation.
import fs from 'node:fs';
import { start } from './node-harness.mjs';
const [root, result, mode] = process.argv.slice(2);
const worker = start(root);
try {
  const opened = await worker.call({ op: 'open' });
  if (mode === 'contend') {
    fs.writeFileSync(result, JSON.stringify(opened)); await worker.destroy();
  } else {
    if (opened.rc !== 0) throw Error(JSON.stringify(opened));
    const updated = await worker.call({ op: 'update' });
    if (updated.rc !== 0) throw Error(JSON.stringify(updated));
    fs.writeFileSync(result, JSON.stringify({ opened, updated, pid: process.pid }));
    // Parent sends real SIGKILL after observing the committed checkpoint file.
    // Worker remains alive, owning kernel flock and uncommitted SQLite state.
  }
} catch (e) { fs.writeFileSync(result, JSON.stringify({ error: e.stack })); await worker.destroy(); process.exitCode = 1; }
