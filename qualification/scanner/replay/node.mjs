import { Worker } from 'node:worker_threads';
const worker = new Worker(new URL('./worker.mjs', import.meta.url));
let settled = false;
const finish = async code => {
  if (settled) return;
  settled = true;
  clearTimeout(timer);
  await worker.terminate();
  process.exitCode = code;
};
const timer = setTimeout(() => {
  console.error(JSON.stringify({ failed: true, reason: 'external 60-second watchdog' }));
  finish(124);
}, 60_000);
worker.on('message', message => {
  console.log(JSON.stringify(message));
  if (message.done) finish(0);
  if (message.failed) finish(1);
});
worker.on('error', error => { console.error(error); finish(1); });
worker.on('exit', code => { if (!settled) { console.error(`early worker exit ${code}`); finish(1); } });
