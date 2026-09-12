import { scanChecks, checkBalance, enhancementChecks, emptyCompletionChecks, scanQueryChecks, historyPageChecks } from './scan-checks.mjs';
// Real HTTPS acquisition -> verified Blob worker -> native OPFS persistence.
export async function runBrowser() {
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
    const abort = new AbortController(); abort.abort();
    try { await openWalletRuntime({ ...options, signal: abort.signal }); throw Error('missing startup abort'); }
    catch (error) { check(error.code === 'ABORTED', 'startup cancellation'); }
    for (const reopened of [false, true]) {
      const runtime = await openWalletRuntime(options);
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
    let emptyRevision;
    const emptyOptions={...options,storage:{kind:'browser-opfs',name:`${name}-empty`}};
    for(const reopen of [false,true]) {
      const opened=await openWalletRuntime(emptyOptions);
      try {const revision=await emptyCompletionChecks(opened.session,fixture.scan,options.network,reopen);if(reopen)check(revision!==emptyRevision,'empty reopen epoch');else emptyRevision=revision;}
      finally{await opened.close();}
    }
    const scanOptions = { ...options, storage: { kind: 'browser-opfs', name: `${name}-scan` } };
    let scanned;
    const first = await openWalletRuntime(scanOptions);
    try { scanned = await scanChecks(first.session, fixture.scan, options.network); } finally { await first.close(); }
    const reopened = await openWalletRuntime(scanOptions);
    try {
      const balance = await reopened.session.getBalance(scanned.query);
      checkBalance(balance, fixture.scan);
      await scanQueryChecks(reopened.session,fixture.scan,scanned.account.id,scanned.queries);
      check(balance.scan.revision !== scanned.balance.scan.revision, 'scanned reopen epoch');
    } finally { await reopened.close(); }
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
    return { emptyCompleted:true, queries:true, pagination:true, watchShared:scanned.watchShared, publicSync:scanned.publicSync, enhancementPending:scanned.enhancementPending, rewoundTo:scanned.rewoundTo, enhanced:true, scanned: true, persisted: true, addresses: addresses.length, workerDestructions, userAgent: navigator.userAgent };
  } finally {
    globalThis.Worker = NativeWorker;
    for (const entry of [name, `${name}-empty`, `${name}-scan`,`${name}-enhanced`,`${name}-history`]) await (await navigator.storage.getDirectory()).removeEntry(entry, { recursive: true }).catch(error => {
      if (error.name !== 'NotFoundError') throw error;
    });
  }
}
