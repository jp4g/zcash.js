import { Worker } from 'node:worker_threads';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { validateCaseResult, CASES } from './case-contract.mjs';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const manifestBytes = await readFile(new URL('./manifest.json', import.meta.url));
const expectedHash = process.argv[2];
if (!/^[0-9a-f]{64}$/.test(expectedHash) || sha(manifestBytes) !== expectedHash) throw Error('expected manifest SHA256 required');
const manifest = JSON.parse(manifestBytes);
for (const [name, expected] of Object.entries(manifest.files)) {
  if (name.startsWith('/') || name.split('/').includes('..')) throw Error('asset path');
  const bytes = await readFile(new URL(name, import.meta.url));
  if (sha(bytes) !== expected.sha256 || bytes.length !== expected.bytes) throw Error(`asset integrity: ${name}`);
}
if (JSON.stringify(manifest.cases) !== JSON.stringify(CASES)) throw Error('case inventory');
console.log(JSON.stringify({ stage:'inputs', node:process.version, manifestSha256:expectedHash, manifest }));
for (const name of CASES) {
  const expected = JSON.parse(await readFile(new URL(`./references/${name}.json`, import.meta.url)));
  await new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./worker.mjs', import.meta.url), { workerData:{ name, expected } });
    const threadId = worker.threadId, stages = [];
    let terminal, failure, stopping = false;
    const stop = error => {
      if (error) failure = error;
      if (!stopping) { stopping = true; worker.terminate().catch(reject); }
    };
    const timer = setTimeout(() => stop(Error(`${name}: external 60-second watchdog`)), 60_000);
    worker.on('message', message => {
      console.log(JSON.stringify({ case:name, ...message }));
      if (message.stage) stages.push(message.stage);
      if (message.failed) stop(Error(message.message));
      if (message.done) {
        try { terminal = validateCaseResult(name,message.result,expected,stages); stop(); }
        catch (error) { stop(error); }
      }
    });
    worker.on('error', stop);
    // Only this independently received event closes the case; terminate() request alone cannot pass.
    worker.on('exit', code => {
      clearTimeout(timer);
      console.log(JSON.stringify({ case:name, stage:'worker-exit-observed', threadId, code }));
      if (failure || !terminal) reject(failure || Error(`${name}: worker exited without verified result`));
      else resolve();
    });
  });
}
console.log(JSON.stringify({ stage:'suite-complete', passed:CASES.length, workerExitsObserved:CASES.length }));
