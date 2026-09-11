// Own each worker until termination, including cancellation and silent exits.
async function runWorker(worker, { signal, deadlineMs = 55000 } = {}) {
  let timer, onAbort, onMessage, onError, onExit;
  try {
    return await new Promise((resolve, reject) => {
      onMessage = resolve;
      onError = reject;
      onExit = code => reject(new Error(`premature worker exit ${code}`));
      onAbort = () => reject(new Error('worker aborted'));
      worker.once('message', onMessage);
      worker.once('error', onError);
      worker.once('exit', onExit);
      timer = setTimeout(() => reject(new Error('worker deadline exceeded')), deadlineMs);
      signal?.addEventListener('abort', onAbort, { once: true });
      if (signal?.aborted) onAbort();
    });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
    // Keep the error listener until termination has completed.
    await worker.terminate();
    worker.removeListener('message', onMessage);
    worker.removeListener('error', onError);
    worker.removeListener('exit', onExit);
  }
}
module.exports = { runWorker };
