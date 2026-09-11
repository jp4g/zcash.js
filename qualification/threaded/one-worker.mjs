export async function oneWorker(spawn, init, timeout = 10000) {
  const worker = spawn('baseline'); let timer;
  try {
    return await new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(Error('baseline deadline')), timeout);
      worker.onerror = reject;
      worker.onmessage = ({ data }) => {
        if (data.type === 'result') resolve(data.result);
        else reject(Error(data.error ?? 'invalid baseline response'));
      };
      worker.postMessage(init);
    });
  } finally { clearTimeout(timer); await worker.terminate(); }
}
