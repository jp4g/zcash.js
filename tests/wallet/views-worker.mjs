// Adapted from the accepted wallet-views-worker.mjs fixture.
// Test driver only: SDK session in the real VIEW worker; same FS/OPFS lifecycle.
import { WalletSession } from '../../dist/src/wallet/session.js';
const node = typeof process !== 'undefined' && process.versions?.node;
function diagnose(phase, error) {
  if (!node) self.postMessage({diagnostic:{phase,atMs:performance.now(),source:import.meta.url,...(error?{error:{name:error.name,message:error.message??String(error),stack:error.stack}}:{})}});
}
if (!node) {
  self.addEventListener('error',e=>diagnose('worker-error',e.error??e));
  self.addEventListener('unhandledrejection',e=>diagnose('unhandled-rejection',e.reason));
  self.addEventListener('message',()=>diagnose('message-arrived'));
}
let port, backend, wasm, options;
if (node) {
  const { parentPort, workerData } = await import('node:worker_threads'); port=parentPort; options=workerData;
} else { port={postMessage:v=>self.postMessage(v)}; }
let owner, session, attempted=false, initializing=false, stopped=false, initializationDone, cancelInitialization;
async function receive(request) {
  diagnose(`receive:${request.op}`);
  let settled=false, finishInitialization,writes=0;
  const reply=value=>{if(!settled){settled=true;port.postMessage({id:request.id,...value,writes});}};
  const ensureRunning=()=>{if(stopped)throw Error('ABORTED');};
  try {
    if (request.op==='initialize') {
      if (attempted) throw Error('DOMAIN_USED'); attempted=true;
      ensureRunning();
      if(request.abort==='before')throw Error('ABORTED');
      initializing=true;
      initializationDone=new Promise(resolve=>{finishInitialization=resolve;});
      cancelInitialization=()=>reply({ok:false,error:'ABORTED',commit:'none'});
      diagnose('module-import-start');
      const bundle = node ? new URL(`file://${options.bundle}/`) : new URL(request.bundle, self.location.href);
      const {initializeViews}=await import(new URL('views.mjs', bundle)).catch(e=>{diagnose('module-error',e);throw e;});
      diagnose('module-import-complete');
      ensureRunning();
      const {acquire}=await import(new URL(node?'wallet-host/node-fs.mjs':'wallet-host/opfs.mjs', bundle));
      ensureRunning();
      diagnose('backend-acquire-start');
      backend=await acquire(node?options.root:request.root,{create:node?options.create:request.create});
      diagnose('backend-acquire-complete');
      ensureRunning();
      diagnose('wasm-read-start');
      if(node){const fs=await import('node:fs');ensureRunning();wasm=new Uint8Array(fs.readFileSync(new URL('bindings_bg.wasm',bundle)));}
      else {const r=await fetch(new URL('bindings_bg.wasm',bundle)); if(!r.ok)throw Error('WASM_UNAVAILABLE'); wasm=new Uint8Array(await r.arrayBuffer());}
      diagnose('wasm-read-complete');
      ensureRunning();
      diagnose('initialize-views-start');
      owner=await initializeViews(wasm,backend,request.format,request.parameters,request.genesis);
      session=new WalletSession(owner);
      diagnose('initialize-views-complete');
      ensureRunning();
      reply({ok:true,generation:owner.generation,instance:owner.instance,secure:!node&&isSecureContext});
    } else if (request.op==='close') {
      if(initializing){if(stopped)throw Error('ABORTED');stopped=true;cancelInitialization();const error=await initializationDone;if(error)throw error;}
      else if(!owner){stopped=true;}
      else await session.close();
      reply({ok:true});
    } else {
      ensureRunning();
      if(!owner)throw Error('DOMAIN_NOT_READY');
      const args=request.args??{}, controller=new AbortController();
      if(request.abort){args.signal=controller.signal;if(request.abort==='before')controller.abort();}
      const sync=backend.sync,write=backend.write;
      backend.write=(...args)=>{writes++;return write(...args);};
      if(request.abort==='duringSync')backend.sync=(...a)=>{const result=sync(...a);controller.abort();return result;};
      if(request.fault==='commit'){let calls=0;backend.sync=(...a)=>{if(++calls===2)throw Object.assign(Error('synthetic commit sync fault'),{code:'EIO'});return sync(...a);};}
      const cryptoObject=globalThis.crypto,random=cryptoObject.getRandomValues;
      if(request.fault==='entropy')cryptoObject.getRandomValues=()=>{throw Error('synthetic entropy unavailable');};
      if(request.fault==='quota')backend.write=()=>{throw Object.assign(Error('synthetic quota fault'),{code:'ENOSPC'});};
      try {
        const methods={account_import:1,account_list:1,account_get:1,address_current:1,address_next:1,address_list:1,address_at:1};
        if(!Object.hasOwn(methods,request.op))throw Error('INVALID_ARGUMENT');
        const result=await session.invoke(request.op,args);reply({ok:true,result});
      }
      finally {backend.sync=sync;backend.write=write;cryptoObject.getRandomValues=random;}
    }
  } catch (e) { diagnose(`operation-error:${request.op}`,e); reply({ok:false,error:typeof e==='string'?e:e.code==='EBUSY'||e.name==='NoModificationAllowedError'?'STORAGE_BUSY':e.message,commit:session?.completion(e)}); }
  finally {
    if(finishInitialization){
      let cleanupError;
      if(stopped){try{if(session)await session.close();else if(backend?.owned)backend.release();}catch(e){cleanupError=e;diagnose('startup-cleanup-error',e);}}
      initializing=false;cancelInitialization=undefined;finishInitialization(cleanupError);
    }
  }
}
if(node)port.on('message',receive); else self.onmessage=e=>receive(e.data);
diagnose('handler-installed');
