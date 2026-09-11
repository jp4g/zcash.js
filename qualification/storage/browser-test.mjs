import { suite } from './suite.mjs';
const results = [], contexts = [], active = new Set();
let index = 0;
const prefix = `storage-${crypto.randomUUID()}`;
function makeWorker() {
  const worker = new Worker('./browser-worker.mjs', { type: 'module' }); active.add(worker);
  return {
    call(command) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { worker.terminate(); done(Error('external worker request timeout')); }, 15000);
        const done = (err, value) => {
          clearTimeout(timer); worker.removeEventListener('message', message); worker.removeEventListener('error', error);
          err ? reject(err) : resolve(value);
        };
        const message = e => done(null, e.data);
        const error = e => done(Error(e.message));
        worker.addEventListener('message', message); worker.addEventListener('error', error); worker.postMessage(command);
      });
    },
    async destroy() { worker.terminate(); active.delete(worker); },
  };
}
let outcome;
try {
  await suite({
    root: () => `${prefix}-${index++}`,
    async start(root, create) {
      // Termination is asynchronous in browsers. A fresh worker acquiring the
      // real exclusive SAH proves release; retry only this pre-SQL lock error.
      const deadline = performance.now() + 4000;
      for (;;) {
        const w = makeWorker();
        const prepared = await w.call({ op: 'prepare', root, create });
        if (!prepared.error) {
          if (!prepared.secure || prepared.isolated || prepared.sab !== 'undefined') throw Error('expected secure no-SAB non-isolated worker');
          contexts.push(prepared); return w;
        }
        if (prepared.code !== 'NoModificationAllowedError' || performance.now() >= deadline) {
          await w.destroy(); return { call: async () => prepared, destroy: async () => {} };
        }
        await w.destroy(); await new Promise(r => setTimeout(r, 50));
      }
    },
  }, result => { results.push(result); document.querySelector('#result').textContent = results.map(r => `${r.test}: PASS`).join('\n'); });
  outcome = { pass: true, results, contexts, userAgent: navigator.userAgent, estimate: await navigator.storage.estimate(), actualQuotaExhaustion: false };
} catch (e) { outcome = { pass: false, error: e.stack, results, contexts }; }
finally { for (const worker of active) worker.terminate(); }
document.querySelector('#result').textContent = JSON.stringify(outcome, null, 2);
await fetch('/result', { method: 'POST', body: JSON.stringify(outcome) });
