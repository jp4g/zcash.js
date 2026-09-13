import {publicWalletChecks} from './public-wallet-checks.mjs';
import {createLightClient,defineNetwork,grpc} from '../../dist/src/index.js';
import {saplingAssets} from '../../dist/src/wallet/proving-assets.js';
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
  if(fixture.crash)return browserDispatchCrash(options,fixture.crash);
  const check = (value, label) => { if (!value) throw Error(label); };
  const same = (a, b) => JSON.stringify(a, (_, v) => typeof v === 'bigint' ? String(v) : v) === JSON.stringify(b, (_, v) => typeof v === 'bigint' ? String(v) : v);
  let account, addresses, previousScan, workerDestructions = 0,webpackWallet=false,publicWalletResult={publicWallet:false};
  const NativeWorker = globalThis.Worker;
  globalThis.Worker = class extends NativeWorker {
    terminate() { workerDestructions++; return super.terminate(); }
  };
  try {
    if(fixture.webpack){mark('webpack-wallet');const {runWallet}=await import('/webpack-wallet.mjs');const result=await runWallet({...options,storage:{kind:'browser-opfs',name:`${name}-webpack`}});check(result.closed&&result.accounts===0,'installed Webpack bundle opens and closes native OPFS wallet');webpackWallet=true;}
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
    await pcztBuildChecks((suffix,limits)=>openWalletRuntime({...options,runtime:{...options.runtime,...limits},storage:{kind:'browser-opfs',name:`${name}-pczt-${suffix}`}}),fixture.pczt,options.network,fixture.proving?location.origin:undefined);
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
    if(fixture.proving){
      mark('public-wallet');check(fixture.pczt.publicWallet,'native public wallet fixture');
      const light=createLightClient({network:await defineNetwork(options.network),transport:grpc(location.origin,{sourceId:'public-wallet-grpc-web',timeoutMs:5000,maxResponseBytes:4*1024*1024,readRetry:{attempts:1,delayMs:0}})});
      const proving={kind:'local',maxConcurrentProofs:1,cache:{kind:'memory',maxBytes:saplingAssets.reduce((n,asset)=>n+asset.byteLength,0)},
        assets:saplingAssets.map(({sha256,blake2b512,...asset})=>({...asset,digest:{algorithm:'sha256',hex:sha256}})),
        async loadAsset({requirement,signal}){const response=await fetch(`/proving/${requirement.assetId}`,{signal,credentials:'omit'});check(response.ok,'public proving asset response');return new Uint8Array(await response.arrayBuffer());}};
      publicWalletResult=await publicWalletChecks(suffix=>({...options,storage:{kind:'browser-opfs',name:`${name}-${suffix}`},
        runtime:{...options.runtime,maxMemoryBytes:1024**3,maxQueuedBytes:104*1024*1024,maxPcztBytes:4*1024*1024},proving,light,broadcaster:light}),
        async(suffix,bytes)=>{const directory=await storageRoot.getDirectoryHandle(`${name}-${suffix}`,{create:true}),file=await directory.getFileHandle('wallet.db',{create:true}),writer=await file.createWritable();try{await writer.write(bytes);}finally{await writer.close();}},
        fixture.pczt,options.network,async()=>{const response=await fetch('/public-wallet-submitted',{cache:'no-store'});check(response.ok,'public dispatch inventory');return response.json();});
    }
    mark('complete');
    return { phases,...publicWalletResult,webpackWallet,proving:!!fixture.proving,shielding:true,idempotency:true,accountsApi:true,memorySigner:true, mnemonicAuthority:true, sharedOwner:true, memoryStorage:true, prerequisiteFallback:true, emptyCompleted:true, offlineSync:true, queries:true, inventory:true, pagination:true, watchShared:scanned.watchShared, publicSync:scanned.publicSync, enhancementPending:scanned.enhancementPending, rewoundTo:scanned.rewoundTo, enhanced:true, scanned: true, persisted: true, addresses: addresses.length, workerDestructions, userAgent: navigator.userAgent };
  } finally {
    globalThis.Worker = NativeWorker;
    for (const entry of [...['transfer','shield','tex',...(fixture.pczt.ironwoodFunding?['ironwood']:[])].map(mode=>`${name}-public-${mode}`),...(fixture.webpack?[`${name}-webpack`]:[]),`${name}-public-transfer-fork`,`${name}-pczt-external`,`${name}-pczt-internal`,`${name}-accounts-a`,`${name}-accounts-b`,`${name}-complete-signer`,`${name}-mnemonic-a`, `${name}-mnemonic-b`, `${name}-shared-a`, `${name}-shared-b`, `${name}-shared-cancel`, name, `${name}-empty`, `${name}-scan`,`${name}-enhanced`,`${name}-history`,`${name}-shielding`]) await (await navigator.storage.getDirectory()).removeEntry(entry, { recursive: true }).catch(error => {
      if (error.name !== 'NotFoundError') throw error;
    });
  }
}

// Opt-in two-page real interruption. Only database state supplies resume IDs.
async function browserDispatchCrash(options,fixture){
  const check=(value,label)=>{if(!value)throw Error(label);};
  const network=await defineNetwork(options.network),light=createLightClient({network,transport:grpc(location.origin,{sourceId:'browser-dispatch-crash',timeoutMs:30000,maxResponseBytes:4*1024*1024,readRetry:{attempts:1,delayMs:0}})});
  const configured={...options,network,storage:{kind:'browser-opfs',name:fixture.name},light,broadcaster:light,confirmations:{trusted:1,untrusted:1,allowZeroConfirmationShielding:false},observation:{pollIntervalMs:1000,maxBufferedUpdates:16},recovery:{mode:'offline'}};
  const {createWalletClient}=await import('../../dist/src/index.js');
  const root=await navigator.storage.getDirectory(),second=new URL(location.href).searchParams.has('reopen');
  if(!second){
    const directory=await root.getDirectoryHandle(fixture.name,{create:true}),file=await directory.getFileHandle('wallet.db',{create:true}),writer=await file.createWritable();
    try{await writer.write(await (await fetch('/crash-wallet.db')).arrayBuffer());}finally{await writer.close();}
  }
  const NativeWorker=globalThis.Worker,post=MessagePort.prototype.postMessage;let initializations=0,terminations=0;
  if(!second){globalThis.walletCrashFinish=0;MessagePort.prototype.postMessage=function(message,...rest){if(message?.command==='payment_attempt_finish')globalThis.walletCrashFinish++;return Reflect.apply(post,this,[message,...rest]);};}
  globalThis.walletCrashRestore=()=>{MessagePort.prototype.postMessage=post;globalThis.Worker=NativeWorker;};
  globalThis.Worker=class extends NativeWorker{
    postMessage(message,...rest){if(message?.type==='initialize'){initializations++;globalThis.walletCrashWorker=this;}return super.postMessage(message,...rest);}
    terminate(){terminations++;return super.terminate();}
  };
  let wallet;
  try{
    wallet=await createWalletClient(configured);check(initializations===1,'exactly one initialized native wallet worker');
    const rows=(await wallet.operations.list()).items,finalized=rows.filter(row=>row.steps.some(step=>step.txid!==null)),drafts=rows.filter(row=>row.steps.every(step=>step.txid===null));
    check(rows.length===2&&finalized.length===1&&drafts.length===1,'discover finalized and draft database operations');
    check(drafts[0].steps.every(step=>step.attempts.length===0)&&drafts[0].missing.includes('finalizedBytes'),'draft remains unfinalized and undispatched');
    const step=finalized[0].steps[0];check(finalized[0].steps.length===1,'single retained transfer');
    if(!second){
      globalThis.walletCrashReady={txid:step.txid,digest:step.exactBytesSha256,attempts:step.attempts.length,initializations};
      // The driver destroys this worker and page; do not await dead-owner cleanup.
      void wallet.broadcast({operationId:finalized[0].operationId}).then(()=>{globalThis.walletCrashSettled=true;},error=>{globalThis.walletCrashSettled=true;globalThis.walletCrashFailure={code:error.code};});
      wallet=undefined;return await new Promise(()=>{});
    }
    const evidence=await (await fetch('/crash-evidence')).json();
    check(step.txid===evidence.before.txid&&step.exactBytesSha256===evidence.before.digest&&step.attempts.length===evidence.before.attempts+1&&step.attempts.at(-1).outcome==='unknown','reopen reconciles durable interrupted attempt without changing bytes');
    const retried=await wallet.broadcast({operationId:finalized[0].operationId});
    check(retried.steps[0].attempts.length===step.attempts.length+1&&retried.steps[0].attempts.at(-1).outcome==='acknowledged','explicit resumed retry acknowledged');
    const received=await (await fetch('/public-wallet-submitted')).json();
    check(received.length===2&&received[0].txid===step.txid&&received[1].txid===received[0].txid&&received[1].hex===received[0].hex,'retry sends exact bytes received before worker destruction');
    await wallet.close();wallet=undefined;check(terminations===1,'reopened native worker closed');
    await root.removeEntry(fixture.name,{recursive:true});
    return {browserDispatchCrash:true,unknownAttempt:true,exactRetry:true,draftUntouched:true,workerDestructions:terminations};
  }finally{globalThis.walletCrashRestore();if(second)await wallet?.close();}
}
