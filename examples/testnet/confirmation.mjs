export async function waitForConfirmation(wallet, pending, { confirmations = 3, timeoutMs = 900000 } = {}) {
  const stop = new AbortController();
  const signal = AbortSignal.any([stop.signal, AbortSignal.timeout(timeoutMs)]);
  const watching = (async () => {
    for await (const _status of wallet.watchSync({ signal })) { /* Drain every status. */ }
    throw Error('Sync watcher ended before confirmation.');
  })();
  const waiting = pending.wait({ confirmations, timeoutMs, signal });
  try {
    return await Promise.race([watching, waiting]);
  } finally {
    stop.abort();
    await Promise.allSettled([watching, waiting]);
  }
}
