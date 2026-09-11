export const context = { secure: isSecureContext, isolated: crossOriginIsolated,
  sab: typeof SharedArrayBuffer, userAgent: navigator.userAgent };
let sequence = 0;
export async function runScenario(scenario, manifest) {
  if (!context.secure || context.isolated || context.sab !== 'undefined') {
    throw new Error(`baseline context rejected: ${JSON.stringify(context)}`);
  }
  const expected = {
    'bootstrap-timeout': /worker deadline exceeded/,
    'bootstrap-error': /intentional bootstrap control failure/,
    'cancel-active': /worker aborted/,
    'cancel-before-start': /worker aborted/,
    'malformed-result': /malformed worker result/,
  }[scenario];
  const abort = new AbortController();
  if (scenario === 'cancel-before-start') abort.abort();
  const id = ++sequence;
  let worker, timer, onAbort, onMessage, onError, abortTimer;
  try {
    const result = await new Promise((resolve, reject) => {
      if (abort.signal.aborted) { reject(new Error('worker aborted')); return; }
      worker = new Worker(new URL(expected ? './control-worker.mjs' : './probe-worker.mjs', import.meta.url),
        { type: 'module', name: `qualification-${id}-${scenario}` });
      onAbort = () => reject(new Error('worker aborted'));
      onMessage = ({ data }) => {
        if (data.type === 'control-started' && expected) {
          if (scenario === 'cancel-active') abortTimer = setTimeout(() => abort.abort(), 20);
          return;
        }
        if (data.type === 'heartbeat' && expected) return;
        if (typeof data.ok !== 'boolean' || data.scenario !== scenario) {
          reject(new Error('malformed worker result')); return;
        }
        if (!data.ok) reject(new Error(`${data.error}\n${data.stack}`));
        else resolve(data);
      };
      onError = event => { event.preventDefault(); reject(new Error(event.message)); };
      worker.addEventListener('message', onMessage);
      worker.addEventListener('error', onError);
      abort.signal.addEventListener('abort', onAbort, { once: true });
      timer = setTimeout(() => reject(new Error('worker deadline exceeded')), expected ? 1500 : 45000);
      worker.postMessage({ scenario, manifest });
    });
    if (expected) throw new Error('control unexpectedly succeeded');
    return { ...result, category: 'runtime', workerName: `qualification-${id}-${scenario}` };
  } catch (error) {
    if (!expected || !expected.test(String(error))) throw error;
    return { ok: true, category: 'harness-control', scenario, observed: String(error),
      workerCreated: Boolean(worker), workerName: `qualification-${id}-${scenario}` };
  } finally {
    clearTimeout(timer);
    clearTimeout(abortTimer);
    abort.signal.removeEventListener('abort', onAbort);
    if (worker) {
      worker.terminate(); // Returns void; CDP runner separately waits for targetDestroyed.
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
    }
  }
}
