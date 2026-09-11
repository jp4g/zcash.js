// Playwright observes the browser's Worker.close event; terminate() alone is not evidence.
async function runOwnedWorker({ worker, operation, terminate, timeoutMs = 60000 }) {
  let closed = false;
  let completed = false;
  let resolveClose;
  let rejectEarly;
  let timer;
  const close = new Promise(resolve => { resolveClose = resolve; });
  const early = new Promise((_, reject) => { rejectEarly = reject; });
  const onClose = () => {
    closed = true;
    resolveClose();
    if (!completed) rejectEarly(new Error('worker closed before result'));
  };
  worker.on('close', onClose);
  const bounded = (promise, message) => Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  })]).finally(() => clearTimeout(timer));
  try {
    return await bounded(Promise.race([Promise.resolve().then(operation), early]), 'worker operation deadline');
  } finally {
    completed = true;
    try {
      if (!closed) await bounded(Promise.resolve().then(terminate), 'worker termination deadline');
      await bounded(close, 'worker destruction deadline');
    } finally {
      worker.removeListener('close', onClose);
    }
  }
}
module.exports = { runOwnedWorker };
