import { Worker } from 'node:worker_threads';
export function nodeFactory(entry, events = []) {
  return (role, index) => {
    const native = new Worker(entry, { name: `qualification-${role}-${index ?? 0}` });
    const wrapper = { onmessage: null, onerror: null, stopping: false,
      postMessage: data => native.postMessage(data),
      crash: () => native.terminate(), // qualification injection: exit remains unexpected
      async terminate() { wrapper.stopping = true; const code = await native.terminate(); events.push({ role, index, type: 'terminated', code }); },
    };
    native.on('message', data => wrapper.onmessage?.({ data }));
    native.on('error', error => wrapper.onerror?.(error));
    native.on('exit', code => { if (!wrapper.stopping) wrapper.onerror?.(Error(`unexpected worker exit ${code}`)); });
    return wrapper;
  };
}
