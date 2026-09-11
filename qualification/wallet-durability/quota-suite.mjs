function require(v,m){if(!v)throw Error(m);}
const stable=v=>JSON.stringify(v,(_,x)=>x && !Array.isArray(x) && typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
function equal(a,b,m){require(stable(a)===stable(b),m);}
export async function suite(harness,report){
  const root=harness.root();let w;
  const call=async command=>{const r=await w.call(command);require(!r.error,`${command.op}: ${JSON.stringify(r)}`);return r;};
  const start=async create=>{w=await harness.start(root,create);await call({op:'walletOpen',create});};
  const observe=complete=>call({op:'walletObserve',complete});
  const close=async()=>{await call({op:'walletClose'});await w.destroy();w=null;};
  try {
    await start(true);await call({op:'walletSetup',import:true});
    for(const [start,end] of [[0,1],[1,2],[2,4]])await call({op:'walletScan',start,end});
    const before=await observe(false);
    require(before.exact.blocks.length>0 && before.exact.sapling_received_notes.length>0,'wallet must contain scanned blocks and notes');
    await close();await start(false);equal(await observe(false),before,'populated baseline reopen');
    report({test:'populated-baseline',pass:true,root,before});
    const pressure=await call({op:'pressure'});report({test:'bounded-native-filler',pass:true,pressure,actualQuotaExhaustion:false});
    const failed=await w.call({op:'walletScan',start:4,end:7});
    const evidence=await call({op:'quotaEvidence'});
    // Persist failures too; this diagnostic row does not itself pass the gate.
    report({test:'scan-attempt',failed,evidence});
    require(failed.error?.startsWith('scan:'),'scan must fail through qualified wallet export');
    const actual=evidence.errors.filter(e=>e.nativeQuota && e.name==='QuotaExceededError' && e.command==='walletScan' && ['wallet.db','wallet.db-journal'].includes(e.file) && ['write','truncate','sync'].includes(e.op));
    require(actual.length>0,'no native SQLite-owned quota error during scan');
    require(evidence.traceDropped===0,'incomplete VFS trace');
    require(evidence.trace.some(t=>t.rc===13 && t.error?.endsWith(':QuotaExceededError')),'native quota not mapped to SQLite FULL');
    require(evidence.trace.some(t=>t.op==='write' && t.rc===0),'scan failed before any successful VFS write');
    await w.destroy();w=null;await start(false);
    const recovered=await observe(false);equal(recovered,before,'full persisted state rollback after destruction');
    report({test:'quota-rollback',pass:true,recovered,actualQuotaExhaustion:true,nativeErrors:actual});
    const freed=await call({op:'freeFiller'});
    await call({op:'walletScan',start:4,end:7});const success=await observe(true);
    equal(success.canonical,harness.reference.imported,'retry native full SQL parity');
    equal(success.exact.accounts,before.exact.accounts,'persistent account identity');
    await close();await start(false);equal(await observe(true),success,'retry persisted state across destruction');
    await close();
    report({test:'actual-quota-populated-scan-rollback-retry',pass:true,actualQuotaExhaustion:true,freed,success});
  } finally {
    if(w)await w.destroy();
    // Manual cleanup of our namespace is not a browser eviction experiment.
    await (await navigator.storage.getDirectory()).removeEntry(root,{recursive:true});
  }
}
