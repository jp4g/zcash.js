// Three storage faults against the shipped modules; all owners are disposable workers.
const check = (ok, label) => { if (!ok) throw Error(label); };
const canonical = value => JSON.stringify(value, (key, v) => key === 'revision' ? undefined : typeof v === 'bigint' ? String(v) : v);
export async function opfsChecks(network, fixture) {
  check(crossOriginIsolated, 'storage interruption requires an isolated page');
  const results = []; let destroyed = 0;
  for (const prefix of ['/runtime', '/threaded']) {
    const root = `opfs-${crypto.randomUUID()}`, migrationRoot = `${root}-legacy`;
    const moduleUrl = URL.createObjectURL(await (await fetch(`${prefix}/wallet.mjs`)).blob());
    const bootstrap = prefix === '/threaded' ? URL.createObjectURL(await (await fetch(`${prefix}/thread-bootstrap.mjs`)).blob()) : undefined;
    async function run(action, name = root, seed) {
      globalThis.walletPhase=`${prefix}:${action}`;
      const workers = [];
      const spawn = url => { const worker = new Worker(url, {type:'module'}); workers.push(worker); return worker; };
      let timer;
      try {
        const owner = spawn('/tests/wallet/opfs-faults.mjs');
        return await new Promise((resolve, reject) => {
          timer = setTimeout(() => reject(Error(`${prefix} ${action} deadline`)), 20000);
          owner.onerror = event => reject(Error(event.message));
          owner.onmessage = async ({data}) => {
            try {
              if (data.error) throw Error(`${prefix} ${action}: ${data.error}\n${data.stack ?? ''}`);
              if (data.pool) {
                await Promise.all([0,1].map(index => new Promise((loaded, failed) => {
                  const child = spawn(bootstrap);
                  child.onerror = event => failed(Error(event.message));
                  child.onmessage = ({data}) => data.type === 'compute-loaded' ? loaded() : failed(Error(JSON.stringify(data)));
                  child.postMessage({type:'compute-initialize',moduleUrl,...data.pool,index});
                })));
                owner.postMessage({poolReady:true});
              } else if (data.paused) resolve(data);
              else if ('result' in data) resolve(data.result);
            } catch (error) { reject(error); }
          };
          owner.postMessage({prefix,network,root:name,seed,action,moduleUrl,threaded:Boolean(bootstrap),legacy:fixture.storageLegacy});
        });
      } finally {
        clearTimeout(timer);
        for (const worker of workers) { worker.terminate(); destroyed++; }
      }
    }
    try {
      globalThis.walletPhase = `${prefix}:quota`;
      const before = await run('snapshot',root,fixture.pczt.publicWallet.database);
      const quota = await run('quota');
      check(quota.nativeQuota, 'wallet VFS must observe actual native quota exhaustion');
      check(canonical(await run('snapshot')) === canonical(before), 'quota rollback preserves wallet');
      const afterRetry = await run('next');
      check(afterRetry.current !== before.current, 'quota retry exposes next address');
      globalThis.walletPhase = `${prefix}:write-interruption`;
      const write = await run('interrupt');
      check(write.paused, 'worker stopped after real database write');
      check(canonical(await run('snapshot')) === canonical(afterRetry), 'hot journal rolls back interrupted write');
      const retried = await run('next');
      check(retried.current !== afterRetry.current, 'interrupted allocation retry exposes next address');
      globalThis.walletPhase = `${prefix}:migration-interruption`;
      const migration = await run('migration',migrationRoot,fixture.storageLegacy.legacyDatabase);
      check(migration.paused, 'opening migration interrupted during database write');
      const migrated = await run('snapshot',migrationRoot);
      check(canonical(await run('snapshot',migrationRoot)) === canonical(migrated), 'migration reopen is idempotent');
      results.push({mode:prefix.slice(1),quota,write,migration});
    } finally {
      URL.revokeObjectURL(moduleUrl); if (bootstrap) URL.revokeObjectURL(bootstrap);
      const storage = await navigator.storage.getDirectory();
      for (const name of [root,migrationRoot]) await storage.removeEntry(name,{recursive:true}).catch(error => { if(error.name !== 'NotFoundError') throw error; });
    }
  }
  return {storageFaults:true,results,workerDestructions:destroyed};
}
