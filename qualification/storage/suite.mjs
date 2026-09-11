// Identical storage scenarios drive actual Node and browser dedicated workers.
const equal = (a, b, label) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw Error(`${label}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`); };
export async function suite(factory, report) {
  const active = new Set();
  async function start(root, create = false) {
    const w = await factory.start(root, create); active.add(w); return w;
  }
  async function stop(w) { await w.destroy(); active.delete(w); }
  async function ok(w, op, args = {}) {
    const value = await w.call({ op, ...args }); equal(value.rc, 0, op); return value;
  }
  async function open(root, create = false) { const w = await start(root, create); await ok(w, 'open'); return w; }
  async function seeded(root) { const w = await open(root, true); await ok(w, 'seed'); return w; }
  async function finish(w) { await ok(w, 'close'); await stop(w); }
  const results = [];
  async function test(name, fn) {
    try { const evidence = await fn(); const r = { test: name, pass: true, evidence }; results.push(r); report(r); }
    finally { await Promise.all([...active].map(stop)); }
  }
  await test('commit-close-destroy-fresh-reopen', async () => {
    const root = await factory.root(); let w = await seeded(root);
    const trace = await w.call({ op: 'trace' });
    for (const op of ['write', 'sync', 'truncate', 'lock', 'unlock', 'size', 'access']) {
      if (!trace.trace.some(e => e.op === op && e.rc === 0)) throw Error(`unexercised ${op}`);
    }
    if (!trace.trace.some(e => e.op === 'read' && e.rc === 522)) throw Error('short-read not exercised');
    await finish(w); w = await open(root); await ok(w, 'verify'); await finish(w);
    return { root, trace };
  });
  await test('allocator-policy-rollback-migration', async () => {
    const root = await factory.root(); let w = await seeded(root);
    const allocator = await ok(w, 'allocator'); await ok(w, 'verify'); await ok(w, 'policy');
    await ok(w, 'update'); await ok(w, 'rollback'); await ok(w, 'verify');
    await ok(w, 'migrate', { fail: true }); equal((await w.call({ op: 'version' })).version, 1, 'rollback schema version');
    await finish(w); w = await open(root); await ok(w, 'verify');
    // Repeating the ALTER proves the failed migration's column was rolled back.
    await ok(w, 'migrate'); await finish(w); w = await open(root);
    equal((await w.call({ op: 'version' })).version, 2, 'committed schema version');
    await ok(w, 'verify'); await finish(w); return { root, allocator, representativeSQL: true };
  });
  await test('concurrent-open-rejected-cleanup-reopen', async () => {
    const root = await factory.root(); const owner = await seeded(root);
    const contender = await start(root);
    const failure = await contender.call({ op: 'open' });
    if (!failure.error || !['EBUSY', 'NoModificationAllowedError'].includes(failure.code)) throw Error(`lock was not rejected: ${JSON.stringify(failure)}`);
    await stop(contender); await ok(owner, 'verify'); await finish(owner);
    const fresh = await open(root); await ok(fresh, 'verify'); await finish(fresh); return { root, failure };
  });
  for (const code of ['ENOSPC', 'QuotaExceededError', 'EIO']) {
    await test(`injected-${code}-rollback-reopen`, async () => {
      const root = await factory.root(); let w = await seeded(root);
      await ok(w, 'fault', { fault: { op: code === 'EIO' ? 'sync' : 'write', file: 'wallet.db-journal', nth: 1, code } });
      const failure = await w.call({ op: 'update', commit: true });
      equal(failure.rc, code === 'EIO' ? 1034 : 13, 'SQLite mapped extended error');
      await w.call({ op: 'rollback' }); await ok(w, 'verify'); await finish(w);
      w = await open(root); await ok(w, 'verify'); await finish(w);
      return { root, failure, injected: true, actualQuotaExhaustion: false };
    });
  }
  await test('uncommitted-worker-destruction-hot-journal-rollback', async () => {
    const root = await factory.root(); let w = await seeded(root);
    await ok(w, 'update'); await stop(w);
    w = await start(root); const disk = await w.call({ op: 'inspect' });
    equal(disk['wallet.db-journal'].header, [217, 213, 5, 249, 32, 161, 99, 215], 'real hot journal magic');
    await ok(w, 'open'); await ok(w, 'verify'); const trace = await w.call({ op: 'trace' });
    if (!trace.trace.some(e => e.op === 'write' && e.file === 'wallet.db')) throw Error('rollback did not write database');
    await finish(w); return { root, disk, trace, crashKind: 'external worker termination' };
  });
  for (const point of [
    { op: 'sync', file: 'wallet.db-journal', nth: 1 },
    { op: 'write', file: 'wallet.db', nth: 1 },
    { op: 'sync', file: 'wallet.db', nth: 1 },
    { op: 'truncate', file: 'wallet.db-journal', nth: 1 },
  ]) {
    await test(`kill-after-${point.file}-${point.op}`, async () => {
      const root = await factory.root(); let w = await seeded(root);
      await ok(w, 'crash', { crash: { ...point } });
      const checkpoint = await w.call({ op: 'update', commit: true });
      equal(checkpoint.checkpoint, { op: point.op, file: point.file }, 'actual primitive checkpoint');
      await stop(w); w = await open(root);
      await ok(w, point.op === 'truncate' ? 'verifyCommitted' : 'verify'); await finish(w);
      return { root, checkpoint, crashKind: 'external worker termination', powerLoss: false };
    });
  }
  return results;
}
