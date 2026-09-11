import { CASES, validateCaseResult } from './case-contract.mjs';
export const context = { secure:isSecureContext, isolated:crossOriginIsolated, sab:typeof SharedArrayBuffer };
export async function runScenario(name) {
  if (!CASES.includes(name)) throw Error('unknown scanner case');
  const response = await fetch(`./references/${name}.json`);
  if (!response.ok) throw Error('reference unavailable');
  const expected = await response.json();
  return new Promise((resolve,reject) => {
    const worker = new Worker('./browser-worker.mjs',{type:'module'});
    const events = [], stages = [];
    const finish = (error,result) => {
      clearTimeout(timer); worker.terminate();
      // External BiDi runner must independently observe realmDestroyed after this request.
      if (error) reject(error);
      else resolve({ ok:true, scenario:name, category:'scanner', result, events, terminationRequested:true });
    };
    const timer = setTimeout(() => finish(Error('external page 60-second watchdog')),60000);
    worker.onerror = error => finish(Error(error.message));
    worker.onmessage = ({data}) => {
      events.push(data);
      if (data.stage) stages.push(data.stage);
      if (data.failed) finish(Error(data.message));
      if (data.done) {
        try { validateCaseResult(name,data.result,expected,stages); finish(null,data.result); }
        catch (error) { finish(error); }
      }
    };
    worker.postMessage({name,expected});
  });
}
