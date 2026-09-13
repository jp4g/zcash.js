// Run the packaged production bootstrap in a real dedicated browser worker.
export async function runBrowser() {
  const { attachWalletWorker } = await import('/dist/src/wallet/host.js');
  const check = (value, label) => { if (!value) throw Error(label); };
  const manifest = await (await fetch('/runtime/manifest.json')).json();
  const urls = new Map();
  let wasm;
  for (const file of manifest.files) {
    const bytes = await (await fetch(`/runtime/${file.url}`)).arrayBuffer();
    const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
    check(bytes.byteLength === file.byteLength && digest === file.sha256, 'packaged asset integrity');
    if (file.kind === 'wasm') wasm = new Uint8Array(bytes);
    else urls.set(file.url, URL.createObjectURL(new Blob([bytes], { type: 'text/javascript' })));
  }
  const { format, files, ...expected } = manifest;
  const fixture = await (await fetch('/fixture.json')).json();
  const name = `sdk-runtime-${crypto.randomUUID()}`;
  const parameters = new TextEncoder().encode('{"encoding":"regtest","Overwinter":10,"Sapling":20,"Blossom":30,"Heartwood":40,"Canopy":50,"Nu5":60,"Nu6":70,"Nu6_1":80,"Nu6_2":90,"Nu6_3":100}');
  let workerDestructions = 0, account, addresses;
  const same = (a, b) => JSON.stringify(a, (_, v) => typeof v === 'bigint' ? String(v) : v) === JSON.stringify(b, (_, v) => typeof v === 'bigint' ? String(v) : v);
  try {
    for (const reopened of [false, true]) {
      const worker = new Worker(urls.get('worker.mjs'), { type: 'module' });
      const { port1, port2 } = new MessageChannel();
      let host,nextId=0;
      const request = (data, transfer = []) => new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Error('runtime startup deadline')), 15000);
        const id=++nextId;
        worker.onmessage = ({ data }) => { clearTimeout(timer);if(data.id!==id)reject(Error('runtime reply identity'));else resolve(data); };
        worker.onerror = () => { clearTimeout(timer); reject(Error('runtime worker failed')); };
        worker.postMessage({...data,id}, transfer);
      });
      try {
        check((await request({ type: 'initialize', moduleUrl: urls.get('wallet.mjs'), wasm, expected,
          maxMemoryBytes: 4096 * 65536 })).type === 'ready', 'verified native handshake');
        if (!reopened) {
          try { await (await navigator.storage.getDirectory()).getDirectoryHandle(name); throw Error('startup created storage'); }
          catch (error) { check(error.name === 'NotFoundError', 'handshake before storage'); }
        }
        check((await request({ type: 'open', hostUrl: urls.get('opfs.mjs'), storage: { kind: 'browser-opfs', name },
          parametersFormat: 'zcash-js-network/1', parameters, genesis: new Uint8Array(32).fill(3), port: port2 }, [port2])).type === 'opened', 'OPFS opened');
        host = attachWalletWorker(port1, async () => { worker.terminate(); workerDestructions++; },
          { maxQueuedJobs: 8, maxQueuedBytes: 65536 });
        worker.onerror = host.crashed;
        if (!reopened) {
          const cancelled = new AbortController(); cancelled.abort();
          try { await host.accounts.import({ ...fixture.import, birthday: 'fullScan', signal: cancelled.signal }); throw Error('missing abort'); }
          catch (error) { check(error.code === 'ABORTED', 'cancelled import'); }
          check((await host.accounts.list()).length === 0, 'cancelled import wrote nothing');
          account = await host.accounts.import({ ...fixture.import, birthday: 'fullScan' });
          await host.addresses.next({ accountId: account.id, request: { format: 'transparent' } });
          addresses = await host.addresses.list({ accountId: account.id });
        } else {
          check(same(await host.accounts.get({ accountId: account.id }), account), 'persistent account');
          check(same(await host.addresses.list({ accountId: account.id }), addresses), 'persistent addresses');
        }
        const balance = await host.getBalance({ accountId: account.id,
          confirmations: { trusted: 1, untrusted: 1, allowZeroConfirmationShielding: true } });
        check(balance.accountId === account.id && balance.amounts === null, 'native unsynced balance');
      } finally {
        if (host) await host.close();
        else { port1.close(); worker.terminate(); workerDestructions++; }
      }
    }
    return { persisted: true, addresses: addresses.length, workerDestructions, userAgent: navigator.userAgent };
  } finally {
    for (const url of urls.values()) URL.revokeObjectURL(url);
    await (await navigator.storage.getDirectory()).removeEntry(name, { recursive: true }).catch(error => {
      if (error.name !== 'NotFoundError') throw error;
    });
  }
}
