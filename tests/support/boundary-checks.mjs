// The same boundary checks run under Node and actual Firefox.
export async function boundaryChecks({ bridgeSignal, admitSignal, waitFor, copyRecord, ownBytes }) {
  let checks = 0;
  const check = (value, label) => { if (!value) throw Error(label); checks++; };
  const invalid = async action => {
    try { await action(); } catch (error) { check(error.code === 'INVALID_ARGUMENT', 'sanitized admission'); return; }
    throw Error('expected invalid argument');
  };
  let reads = 0;
  const hostile = () => { reads++; throw Error('private-input'); };
  await invalid(() => copyRecord(Object.defineProperty({}, 'signal', { get: hostile }), ['signal']));
  await invalid(() => copyRecord({ extra: true }, ['signal']));
  const original = { value: 7 };
  const record = copyRecord(new Proxy(original, { get: hostile }), ['value']);
  original.value = 8;
  check(record.value === 7 && Object.getPrototypeOf(record) === null, 'owned data descriptors');
  const bytes = new Uint8Array([0, 1, 2, 3]);
  const view = bytes.subarray(1, 3);
  Object.defineProperty(view, 'buffer', { get: hostile });
  const owned = ownBytes(view, () => Error('protocol'), () => Error('limit'));
  bytes.fill(9);
  check(owned.join(',') === '1,2', 'owned intrinsic byte range');

  for (const protect of [false, true]) {
    const controller = new AbortController();
    controller.signal.addEventListener('abort', event => event.stopImmediatePropagation());
    for (const name of ['aborted', 'reason', 'addEventListener', 'removeEventListener']) {
      Object.defineProperty(controller.signal, name, { get: hostile });
    }
    const bound = await bridgeSignal(controller.signal, protect);
    controller.signal.dispatchEvent(new Event('abort'));
    check(!bound.signal.aborted, 'synthetic events do not cancel');
    controller.abort();
    check(bound.signal.aborted, 'native abort survives listener suppression and shadows');
    bound.close(); bound.close();
    const closed = new AbortController(), released = await bridgeSignal(closed.signal, protect);
    released.close(); closed.abort();
    check(!released.signal.aborted, 'closed bridge does not forward');
    const pre = await bridgeSignal(AbortSignal.abort(), protect);
    check(pre.signal.aborted, 'pre-abort forwarded');
    pre.close();
  }
  const controller = new AbortController();
  for (const signal of [null, {}, Object.create(AbortSignal.prototype), new Proxy(controller.signal, {})]) {
    await invalid(() => bridgeSignal(signal));
  }
  const revoked = Proxy.revocable(controller.signal, {}); revoked.revoke();
  await invalid(() => bridgeSignal(revoked.proxy));
  Object.defineProperty(controller.signal, 'aborted', { get: hostile });
  await invalid(() => admitSignal(controller.signal));
  check(reads === 0, 'caller getters never evaluated');

  const pending = new AbortController(), stopped = Error('stopped');
  let finish;
  const promise = waitFor(new Promise(resolve => { finish = resolve; }), pending.signal, () => stopped);
  pending.abort();
  try { await promise; throw Error('expected abort'); } catch (error) { check(error === stopped, 'abort error identity'); }
  finish('late');
  try { await waitFor(Promise.reject(Error('late')), pending.signal, () => stopped); }
  catch (error) { check(error === stopped, 'pre-abort owns late rejection'); }
  const live = new AbortController();
  check(await waitFor(Promise.resolve(7), live.signal, () => stopped) === 7, 'fulfilled wait');
  try { await waitFor(Promise.reject(stopped), live.signal, () => Error('wrong')); }
  catch (error) { check(error === stopped, 'rejected wait'); }
  return checks;
}
