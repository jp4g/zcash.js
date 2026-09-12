// Same native scanner workflow runs against the real Node and OPFS loader owners.
export async function scanChecks(session, fixture) {
  const check = (ok, label) => { if (!ok) throw Error(label); };
  const hex = value => Uint8Array.from(value.match(/../g) ?? [], byte => parseInt(byte, 16));
  const account = await session.accounts.import(fixture.import);
  const plan = await session.scan.plan({ target: fixture.target });
  check(plan.ranges.length > 0, 'native planner schedules full scan');
  const query = { accountId: account.id, confirmations: { trusted: 1, untrusted: 1, allowZeroConfirmationShielding: true } };
  let revision = plan.revision;
  for (const [index, batch] of fixture.batches.entries()) {
    const input = { target: plan.target, revision, priorTreeState: hex(batch.priorTreeState), blocks: batch.blocks.map(hex) };
    if (index === 0) {
      const cancelled = new AbortController(); cancelled.abort();
      try { await session.scan.ingest({ ...input, signal: cancelled.signal }); throw Error('missing cancellation'); }
      catch (error) { check(error.code === 'ABORTED' && session.completion(error).completion === 'none', 'cancelled scan wrote nothing'); }
      check((await session.getBalance(query)).scan.revision === revision, 'cancelled scan retains revision');
    }
    const receipt = await session.scan.ingest(input);
    check(receipt.blocks === batch.blocks.length && receipt.revision !== revision, 'native batch commit receipt');
    check((await session.getBalance(query)).scan.revision === receipt.revision, 'balance sees committed revision');
    if (index === 0) {
      try { await session.scan.ingest(input); throw Error('accepted stale plan'); }
      catch (error) { check(error.code === 'CURSOR_STALE' && session.completion(error).completion === 'none', 'stale batch cannot replay'); }
    }
    revision = receipt.revision;
  }
  const balance = await session.getBalance(query);
  checkBalance(balance, fixture);
  return { account, balance, query };
}
export function checkBalance(balance, fixture) {
  const same = (a, b) => JSON.stringify(a, (_, value) => typeof value === 'bigint' ? String(value) : value) === JSON.stringify(b);
  const { revision, ...scan } = balance.scan;
  if (!same(scan, fixture.expectedScan) || !same(balance.amounts, fixture.expectedAmounts)) throw Error('native populated balance/scan mismatch');
}
