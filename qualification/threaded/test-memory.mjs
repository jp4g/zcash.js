import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
if (!isMainThread) {
  try {
    const module = await WebAssembly.compile(await readFile(new URL('qualification_bg.wasm',workerData.url)));
    const bindings = await import(new URL('qualification.js',workerData.url));
    await bindings.default({ module_or_path: module, memory: new WebAssembly.Memory(workerData.memory) });
    parentPort.postMessage({ accepted: true });
  } catch (error) { parentPort.postMessage({ accepted: false, error: String(error) }); }
} else {
  const url = pathToFileURL(process.argv[2] + '/threaded/').href;
  for (const memory of [{ initial: 277, maximum:4096 }, { initial:277,maximum:8192,shared:true }, { initial:1,maximum:4096,shared:true }]) {
    const worker = new Worker(new URL(import.meta.url), { workerData:{ url, memory } });
    let timer;
    try {
      const result = await new Promise((resolve,reject) => { timer = setTimeout(()=>reject(Error('memory test timeout')),10000); worker.once('message',resolve); worker.once('error',reject); });
      assert.equal(result.accepted,false); assert.match(result.error,/LinkError/);
      console.log(JSON.stringify({memory, ...result}));
    } finally { clearTimeout(timer); await worker.terminate(); }
  }
}
