function require(v,m){if(!v)throw Error(m);}
const stable=v=>JSON.stringify(v,(_,x)=>x && !Array.isArray(x) && typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
function equal(a,b,m){require(stable(a)===stable(b),m);}
export function capacityEvidence({pressure:p,failed,evidence:e,config,barriers,freed,completed}) {
  require(config?.fixedLimitKiB===32768,'missing configured finite quota');
  const quota=p?.before?.quota, usage=p?.before?.usage;
  require(Number.isSafeInteger(quota) && quota>0 && quota<=config.fixedLimitKiB*1024 && Number.isSafeInteger(usage) && usage>=0,'invalid measured quota');
  require(Number.isSafeInteger(p.bytes) && p.bytes>=16384 && p.bytes<=64*1024*1024 && usage+p.bytes===quota,'missing measured bounded saturation');
  require(p.retained===p.bytes-16384 && p.after?.quota===quota && p.after.usage===usage+p.retained,'pressure/headroom mismatch');
  const last=p.writes?.at(-1), error=p.errors?.at(-1);
  require((p.saturation==='zero-write' && last?.file==='quota-filler' && last.op==='write' && last.at===p.bytes && last.requested===1 && last.returned===0) ||
    (p.saturation==='native-quota-error' && error?.name==='QuotaExceededError' && error.file==='quota-filler' && error.at===p.bytes && error.requested===1),'missing saturation operation');
  require(failed?.error?.startsWith('scan:'),'scan did not fail');
  const sqliteExtendedCode=Number(failed.error.match(/extended_code: (\d+)/)?.[1]);
  require(e?.traceDropped===0 && e.estimate?.quota===quota && e.trace.some(t=>t.op==='write' && t.rc===0),'missing complete scan filesystem evidence');
  const files=['wallet.db','wallet.db-journal'];
  const native=e.errors?.find(x=>x.nativeQuota===true && x.name==='QuotaExceededError' && x.command==='walletScan' && files.includes(x.file) && ['write','truncate','sync'].includes(x.op));
  let signal;
  if(native && sqliteExtendedCode===13 && e.trace.some(t=>t.file===native.file && t.op===native.op && t.rc===13 && t.error?.endsWith(':QuotaExceededError'))) {
    signal={platformSignal:native.name,standardDOMQuota:true,sqliteFile:native.file,sqliteOperation:native.op};
  } else {
    const probe=p.probe;
    require(probe?.name==='NS_ERROR_FILE_NO_DEVICE_SPACE' && probe.code===probe.name && probe.error?.includes('0x80520010 (NS_ERROR_FILE_NO_DEVICE_SPACE)') && probe.op==='truncate' && probe.file==='quota-filler' && probe.from===p.bytes && probe.requestedSize===p.bytes+1 && probe.requestedSize<=64*1024*1024 && probe.sizeAfter===undefined,'missing bounded original native capacity error');
    const short=e.shortWrites?.find(x=>x.command==='walletScan' && files.includes(x.file) && x.op==='write' && x.returned===0 && Number.isSafeInteger(x.at) && x.at>=0 && Number.isSafeInteger(x.requested) && x.requested>0);
    require(short && sqliteExtendedCode===778 && failed.error.includes('SystemIoFailure') && e.trace.some(t=>t.op==='write' && t.file===short.file && t.rc===778) && !e.trace.some(t=>t.rc===13),'missing same-scan zero-write / accurate SQLite 778');
    signal={platformSignal:probe.name,platformCode:'0x80520010',platformError:probe.error,standardDOMQuota:false,sqliteFile:short.file,sqliteOperation:short.op,sqliteOffset:short.at,sqliteRequested:short.requested,sqliteReturned:short.returned};
  }
  require(['rollback','retry','nativeParity','identity','reopen','cleanup'].every(k=>completed?.[k]===true),'missing verified recovery or cleanup');
  require(barriers?.length===4 && barriers.every((b,i)=>b.made===i+1 && b.created.length===b.made && b.created.every(r=>b.destroyed.includes(r))),'missing external destruction barriers');
  require(freed?.freed==='quota-filler' && freed.estimate?.quota===quota && freed.estimate.usage===usage,'missing pressure release');
  return {...signal,sqliteExtendedCode,sqlitePrimaryCode:sqliteExtendedCode&255,configuredFixedLimitKiB:config.fixedLimitKiB,measuredOriginQuota:quota,saturatedUsage:usage+p.bytes};
}
export async function suite(harness,report){
  const root=harness.root();let w;
  const completed={}, proof={config:harness.quotaConfig,barriers:harness.barriers,completed};
  const call=async command=>{const r=await w.call(command);if(r.error)report({test:'command-failure',command:command.op,failure:r});require(!r.error,`${command.op}: ${JSON.stringify(r)}`);return r;};
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
    const pressure=proof.pressure=await call({op:'pressure'});report({test:'bounded-native-filler',pass:true,pressure,actualQuotaExhaustion:false});
    const failed=await w.call({op:'walletScan',start:4,end:7});
    const evidence=await call({op:'quotaEvidence'});
    Object.assign(proof,{failed,evidence});
    // Persist failures too; this diagnostic row does not itself pass the gate.
    report({test:'scan-attempt',failed,evidence});
    require(failed.error?.startsWith('scan:'),'scan must fail through qualified wallet export');
    const actual=evidence.errors.filter(e=>e.nativeQuota && e.name==='QuotaExceededError' && e.command==='walletScan' && ['wallet.db','wallet.db-journal'].includes(e.file) && ['write','truncate','sync'].includes(e.op));
    // Preserve real rollback/retry evidence even when Firefox reports short/zero
    // writes instead of a native exception. The original gate still applies below.
    await w.destroy();w=null;await start(false);
    const recovered=await observe(false);equal(recovered,before,'full persisted state rollback after destruction');
    completed.rollback=true;
    report({test:'pressure-rollback',pass:true,recovered,actualQuotaExhaustion:false,nativeErrors:actual});
    const freed=proof.freed=await call({op:'freeFiller'});
    await call({op:'walletScan',start:4,end:7});const success=await observe(true);
    completed.retry=true;
    equal(success.canonical,harness.reference.imported,'retry native full SQL parity');
    completed.nativeParity=true;
    equal(success.exact.accounts,before.exact.accounts,'persistent account identity');
    completed.identity=true;
    await close();await start(false);equal(await observe(true),success,'retry persisted state across destruction');
    completed.reopen=true;
    await close();
    report({test:'pressure-retry-native-parity-reopen',pass:true,freed,success,actualQuotaExhaustion:false});
  } finally {
    if(w)await w.destroy();
    // Manual cleanup of our namespace is not a browser eviction experiment.
    await (await navigator.storage.getDirectory()).removeEntry(root,{recursive:true});
    completed.cleanup=true;
  }
  const signal=capacityEvidence(proof);
  report({test:'actual-quota-populated-scan-rollback-retry',pass:true,actualQuotaExhaustion:true,signal,completed});
}
