function stable(v) { return JSON.stringify(v, (_, x) => x && !Array.isArray(x) && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map(k => [k,x[k]])) : x); }
// Identical synthetic wallet operations in Node and dedicated OPFS workers.
function require(value, message) { if (!value) throw Error(message); }
function equal(a, b, message) { require(stable(a) === stable(b), message); }
export async function suite(harness, report) {
  const active = new Set();
  const start = async (root,create=false) => { const w=await harness.start(root,create); active.add(w); return w; };
  const destroy = async w => { await w.destroy(); active.delete(w); };
  const call = async (w,command) => { const r=await w.call(command); require(!r.error,`${command.op}: ${JSON.stringify(r)}`); return r; };
  const open = (w,create=false) => call(w,{op:'walletOpen',create});
  const observe = (w,complete=false) => call(w,{op:'walletObserve',complete});
  const close = async w => { await call(w,{op:'walletClose'}); await destroy(w); };
  const reference = harness.reference;
  try {
    if (harness.phase !== 'interruptions') for (const imported of [false,true]) {
      const root=harness.root(); let w=await start(root,true); await open(w,true);
      const empty=await w.call({op:'walletObserve'});
      require(empty.error?.startsWith('accounts query:'),'empty schema must fail query distinctly');
      await call(w,{op:'walletSetup',import:imported});
      const before=await observe(w);
      await close(w); w=await start(root); await open(w);
      equal(await observe(w),before,'account/address/public key changed across owner destruction');
      const query=await w.call({op:'walletBadQuery'});
      require(query.error?.startsWith('query failed:'),'query failure cannot masquerade as empty');
      if (imported) {
        for (const [first,end] of [[0,1],[1,2],[2,4],[4,7]]) {
          await call(w,{op:'walletScan',start:first,end});
          const saved=await observe(w,end===7); await close(w); w=await start(root); await open(w);
          equal(await observe(w,end===7),saved,'batch state changed across reopen');
        }
      } else {
        equal(await call(w,{op:'walletScan'}),{saplingReceived:2,saplingSpent:1,ironwoodReceived:2,ironwoodSpent:1},'real scanner counts');
      }
      const committed=await observe(w,true);
      equal(committed.canonical,reference[imported?'imported':'created'],'separate native canonical SQL parity');
      await close(w); w=await start(root); await open(w);
      equal(await observe(w,true),committed,'complete persisted wallet changed after destruction');
      await call(w,{op:'walletScan'});
      equal(await observe(w,true),committed,'committed scan replay not idempotent');
      await close(w);
      report({test:imported?'imported-account-batches-reopen':'created-account-scan-reopen',pass:true,root,integrity:committed.integrity,balances:committed.public.balances,roots:committed.roots,tables:Object.keys(committed.exact).length});
    }
    if (harness.phase !== 'tracer') for (const point of [
      {op:'sync',file:'wallet.db-journal',nth:1},
      {op:'write',file:'wallet.db',nth:1},
      {op:'sync',file:'wallet.db',nth:1},
      {op:'truncate',file:'wallet.db-journal',nth:1},
    ]) {
      const root=harness.root();let w=await start(root,true);await open(w,true);
      await call(w,{op:'walletSetup'});const before=await observe(w);await close(w);
      w=await start(root);await open(w);await call(w,{op:'crash',crash:{...point}});
      const checkpoint=await call(w,{op:'walletScan'});
      equal(checkpoint.checkpoint,{op:point.op,file:point.file},'real VFS checkpoint absent');
      await destroy(w);w=await start(root);
      const files=await call(w,{op:'inspect'});
      if(point.op==='write') equal(files['wallet.db-journal'].header,[217,213,5,249,32,161,99,215],'actual hot journal magic');
      await open(w);const committed=point.op==='truncate';
      const recovered=await observe(w,committed);
      if(committed) equal(recovered.canonical,reference.created,'post commit interruption lost state');
      else equal(recovered,before,'interrupted real scanner transaction did not roll back');
      const recoveryTrace=await call(w,{op:'trace'});
      if(point.op==='write') require(recoveryTrace.trace.some(t=>t.op==='write' && t.file==='wallet.db'),'hot journal recovery performed no database writes');
      await call(w,{op:'walletScan'});const success=await observe(w,true);
      equal(success.canonical,reference.created,'retry failed native parity');
      await close(w);w=await start(root);await open(w);
      equal(await observe(w,true),success,'retry state not durable');
      await call(w,{op:'walletScan'});equal(await observe(w,true),success,'retry not idempotent');await close(w);
      report({test:`real-scan-interruption-${point.op}-${point.file}`,pass:true,root,checkpoint:checkpoint.checkpoint,files,recoveryWrites:recoveryTrace.trace.filter(t=>t.op==='write' && t.file==='wallet.db').length,expected:committed?'committed':'rollback'});
    }
    if (harness.phase !== 'tracer') {
      const root=harness.root();let w=await start(root,true);await open(w,true);await call(w,{op:'walletSetup'});
      const before=await observe(w);
      await call(w,{op:'fault',fault:{op:'write',file:'wallet.db',nth:1,code:'ENOSPC'}});
      const failed=await w.call({op:'walletScan'});require(failed.error?.startsWith('scan:'),'injected transaction error not surfaced');
      equal(await observe(w),before,'failed real transaction left mutations');await close(w);
      w=await start(root);await open(w);equal(await observe(w),before,'failed transaction rollback not durable');
      await call(w,{op:'walletScan'});equal((await observe(w,true)).canonical,reference.created,'failed transaction retry');await close(w);
      report({test:'injected-ENOSPC-real-scan-rollback-retry',pass:true,error:failed.error,actualQuotaExhaustion:false});
    }
    const missing=harness.root(); const w=await start(missing,false);
    const absent=await w.call({op:'walletOpen'}); require(Boolean(absent.error),'missing wallet reopened successfully'); await destroy(w);
    report({test:'missing-wallet-fails-without-recreation',pass:true,error:absent.error});
  } finally { for (const w of active) await w.destroy(); }
}
