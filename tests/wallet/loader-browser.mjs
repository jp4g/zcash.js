import {shieldingChecks} from './shielding-checks.mjs';
import {accountsChecks} from './accounts-checks.mjs';
import {pcztBuildChecks} from './pczt-build-checks.mjs';
import { memorySignerChecks, mnemonicWalletChecks, sharedWalletChecks, memoryWalletChecks, offlineSyncChecks, scanChecks, checkBalance, enhancementChecks, emptyCompletionChecks, scanQueryChecks, historyPageChecks } from './scan-checks.mjs';
// Real HTTPS acquisition -> verified Blob worker -> native OPFS persistence.
export async function runBrowser() {
  const started=performance.now(),phases=[];
  const mark=name=>{globalThis.walletPhase=name;phases.push({name,elapsedMs:Math.round(performance.now()-started)});};
  globalThis.walletPhases=phases;mark('startup');
  const { openWalletRuntime } = await import('/dist/src/runtime/wallet.js');
  const { manifestSha256 } = await (await fetch('/runtime-pin.json')).json();
  const fixture = await (await fetch('/fixture.json')).json();
  const name = `sdk-loader-${crypto.randomUUID()}`;
  const parameters = new TextEncoder().encode('{"encoding":"regtest","Overwinter":10,"Sapling":20,"Blossom":30,"Heartwood":40,"Canopy":50,"Nu5":60,"Nu6":70,"Nu6_1":80,"Nu6_2":90,"Nu6_3":100}');
  const options = { runtime: { baseline: { manifestUrl: new URL('/runtime/manifest.json', location.href).href, manifestSha256 },
    threading: { mode: 'baseline' }, maxMemoryBytes: 512 * 1024 * 1024, maxQueuedBytes: 65536, maxQueuedJobs: 8, scanBatchSize: 10, maxPcztBytes: 65536 },
    storage: { kind: 'browser-opfs', name },
    network: { identity: 'synthetic-regtest', genesisHash: '03'.repeat(32), parametersFormat: 'zcash-js-network/1', parameters } };
  const check = (value, label) => { if (!value) throw Error(label); };
  const same = (a, b) => JSON.stringify(a, (_, v) => typeof v === 'bigint' ? String(v) : v) === JSON.stringify(b, (_, v) => typeof v === 'bigint' ? String(v) : v);
  let account, addresses, previousScan, workerDestructions = 0;
  const NativeWorker = globalThis.Worker;
  globalThis.Worker = class extends NativeWorker {
    terminate() { workerDestructions++; return super.terminate(); }
  };
  try {
    for(const [storage,signal,code] of [[{kind:'memory',name:'invalid'},undefined,'INVALID_ARGUMENT'],[{kind:'memory'},AbortSignal.abort(),'ABORTED']]) {
      try {await openWalletRuntime({...options,storage,signal});throw Error('unexpected memory startup');}
      catch(error){check(error.code===code,'memory storage admission/cancellation');}
    }
    const storageRoot=await navigator.storage.getDirectory();
    const names=[];for await(const name of storageRoot.keys())names.push(name);
    for(const populate of [true,false]) {
      const opened=await openWalletRuntime({...options,storage:{kind:'memory'}});
      try {await memoryWalletChecks(opened.session,fixture,populate);}finally{await opened.close();}
    }
    const after=[];for await(const name of storageRoot.keys())after.push(name);
    check(same(names.sort(),after.sort()),'memory opens create no OPFS wallet files');
    await sharedWalletChecks((suffix,signal)=>openWalletRuntime({...options,signal,storage:{kind:'browser-opfs',name:`${name}-shared-${suffix}`}}),fixture);
    await mnemonicWalletChecks(suffix=>openWalletRuntime({...options,storage:{kind:'browser-opfs',name:`${name}-mnemonic-${suffix}`}}));
    mark('memory-signer');
    await memorySignerChecks(()=>openWalletRuntime({...options,storage:{kind:'browser-opfs',name:`${name}-complete-signer`}}),fixture.signer,options.network);
    mark('accounts-api');
    await accountsChecks(suffix=>openWalletRuntime({...options,storage:{kind:'browser-opfs',name:`${name}-accounts-${suffix}`}}),fixture,options.network);
    mark('pczt-build');
    await pcztBuildChecks(suffix=>openWalletRuntime({...options,storage:{kind:'browser-opfs',name:`${name}-pczt-${suffix}`}}),fixture.pczt,options.network);
    mark('persistent-reopen');
    const abort = new AbortController(); abort.abort();
    try { await openWalletRuntime({ ...options, signal: abort.signal }); throw Error('missing startup abort'); }
    catch (error) { check(error.code === 'ABORTED', 'startup cancellation'); }
    for (const reopened of [false, true]) {
      check(!crossOriginIsolated, 'fixture lacks threaded prerequisite');
      const diagnostics = [], start = performance.getEntriesByType('resource').length;
      const runtime = await openWalletRuntime({ ...options, runtime: { ...options.runtime,
        threading: reopened ? { mode: 'prefer-threaded', artifact: { manifestUrl: new URL('/threaded-must-not-fetch.json', location.href).href,
          manifestSha256: '00'.repeat(32) }, workers: 2, startupTimeoutMs: 1000 } : { mode: 'baseline' },
        onDiagnostic(event) { diagnostics.push(event); throw Error('ignored diagnostic failure'); } } });
      check(same(diagnostics, [reopened ? { code: 'THREADED_FALLBACK', reason: 'prerequisiteMissing' }
        : { code: 'BASELINE_SELECTED', reason: 'requested' }]), 'sanitized runtime selection diagnostic');
      check(Object.isFrozen(diagnostics[0]), 'immutable diagnostic');
      const fetched = performance.getEntriesByType('resource').slice(start).map(entry => new URL(entry.name).pathname);
      check(fetched.includes('/runtime/manifest.json'), 'fresh verified baseline acquisition');
      check(!fetched.includes('/threaded-must-not-fetch.json'), 'no threaded acquisition');
      try {
        check(runtime.identity.mode === 'baseline', 'baseline identity');
        if (!reopened) {
          account = await runtime.session.accounts.import({ ...fixture.import, birthday: 'fullScan' });
          await runtime.session.addresses.next({ accountId: account.id, request: { format: 'transparent' } });
          addresses = await runtime.session.addresses.list({ accountId: account.id });
        } else {
          check(same(await runtime.session.accounts.get({ accountId: account.id }), account), 'persistent account');
          check(same(await runtime.session.addresses.list({ accountId: account.id }), addresses), 'persistent addresses');
        }
        const balance = await runtime.session.getBalance({ accountId: account.id,
          confirmations: { trusted: 1, untrusted: 1, allowZeroConfirmationShielding: true } });
        check(balance.accountId === account.id && balance.amounts === null, 'native balance');
        check(typeof balance.scan.revision === 'string' && balance.scan.scanComplete === null, 'native scan state');
        if (reopened) check(balance.scan.revision !== previousScan.revision, 'new owner revision');
        previousScan = balance.scan;
      } finally { await runtime.close(); }
    }
    mark('empty-completion');
    let emptyRevision;
    const emptyOptions={...options,network:{...options.network,genesisHash:Array.from({length:32},(_,i)=>i.toString(16).padStart(2,'0')).join('')},storage:{kind:'browser-opfs',name:`${name}-empty`}};
    for(const reopen of [false,true]) {
      const opened=await openWalletRuntime(emptyOptions);
      try {const revision=await emptyCompletionChecks(opened.session,fixture.scan,emptyOptions.network,reopen);if(reopen)check(revision!==emptyRevision,'empty reopen epoch');else emptyRevision=revision;}
      finally{await opened.close();}
    }
    mark('scan');
    const scanOptions = { ...options, storage: { kind: 'browser-opfs', name: `${name}-scan` } };
    let scanned;
    const first = await openWalletRuntime(scanOptions);
    try { scanned = await scanChecks(first.session, fixture.scan, options.network); } finally { await first.close(); }
    const reopened = await openWalletRuntime(scanOptions);
    try {
      await offlineSyncChecks(reopened.session);
      const balance = await reopened.session.getBalance(scanned.query);
      checkBalance(balance, fixture.scan);
      await scanQueryChecks(reopened.session,fixture.scan,scanned.account.id,scanned.queries);
      check(balance.scan.revision !== scanned.balance.scan.revision, 'scanned reopen epoch');
    } finally { await reopened.close(); }
    mark('enhancement');
    check(fixture.enhancement,'native enhancement fixture');
    const enhancedOptions={...options,storage:{kind:'browser-opfs',name:`${name}-enhanced`}};
    const directory=await(await navigator.storage.getDirectory()).getDirectoryHandle(enhancedOptions.storage.name,{create:true});
    const file=await directory.getFileHandle('wallet.db',{create:true}),writer=await file.createWritable();
    await writer.write(Uint8Array.from(fixture.enhancement.database.match(/../g),byte=>parseInt(byte,16)));await writer.close();
    let enhancedRevision;
    for(const reopen of [false,true]) {
      const opened=await openWalletRuntime(enhancedOptions);
      try {
        const revision=await enhancementChecks(opened.session,fixture.enhancement,reopen);
        if(reopen)check(revision!==enhancedRevision,'enhanced reopen epoch');else enhancedRevision=revision;
      } finally {await opened.close();}
    }
    mark('history');
    check(fixture.history,'native paginated history fixture');
    const historyOptions={...options,storage:{kind:'browser-opfs',name:name+'-history'}};
    const historyDirectory=await(await navigator.storage.getDirectory()).getDirectoryHandle(historyOptions.storage.name,{create:true});
    const historyFile=await historyDirectory.getFileHandle('wallet.db',{create:true}),historyWriter=await historyFile.createWritable();
    await historyWriter.write(Uint8Array.from(fixture.history.database.match(/../g),byte=>parseInt(byte,16)));await historyWriter.close();
    let cursor;
    for(const reopen of [false,true]) {
      const opened=await openWalletRuntime(historyOptions);
      try {cursor=await historyPageChecks(opened.session,fixture.history,reopen?cursor:undefined);}
      finally {await opened.close();}
    }
    mark('shielding');
    check(fixture.shielding,'native shielding fixture');
    const shieldingOptions={...options,storage:{kind:'browser-opfs',name:name+'-shielding'}};
    const shieldingDirectory=await(await navigator.storage.getDirectory()).getDirectoryHandle(shieldingOptions.storage.name,{create:true});
    const shieldingFile=await shieldingDirectory.getFileHandle('wallet.db',{create:true}),shieldingWriter=await shieldingFile.createWritable();
    await shieldingWriter.write(Uint8Array.from(fixture.shielding.database.match(/../g),byte=>parseInt(byte,16)));await shieldingWriter.close();
    let shielding;
    for(const reopen of [false,true]) {
      const opened=await openWalletRuntime(shieldingOptions);
      try {shielding=await shieldingChecks(opened.session,fixture.shielding,options.network,reopen?shielding:undefined);}
      finally {await opened.close();}
    }
    mark('complete');
    return { phases,shielding:true,idempotency:true,accountsApi:true,memorySigner:true, mnemonicAuthority:true, sharedOwner:true, memoryStorage:true, prerequisiteFallback:true, emptyCompleted:true, offlineSync:true, queries:true, inventory:true, pagination:true, watchShared:scanned.watchShared, publicSync:scanned.publicSync, enhancementPending:scanned.enhancementPending, rewoundTo:scanned.rewoundTo, enhanced:true, scanned: true, persisted: true, addresses: addresses.length, workerDestructions, userAgent: navigator.userAgent };
  } finally {
    globalThis.Worker = NativeWorker;
    for (const entry of [`${name}-accounts-a`,`${name}-accounts-b`,`${name}-complete-signer`,`${name}-mnemonic-a`, `${name}-mnemonic-b`, `${name}-shared-a`, `${name}-shared-b`, `${name}-shared-cancel`, name, `${name}-empty`, `${name}-scan`,`${name}-enhanced`,`${name}-history`,`${name}-shielding`]) await (await navigator.storage.getDirectory()).removeEntry(entry, { recursive: true }).catch(error => {
      if (error.name !== 'NotFoundError') throw error;
    });
  }
}
