import { acquire } from './opfs.mjs';
import { load } from './load.mjs';
import { dispatch } from './dispatch.mjs';
import { fill, isNativeQuota } from './quota-pressure.mjs';
let host,runtime,root,command,errors=[];
onmessage=async ({data})=>{
  try {
    if(data.op==='prepare') {
      if(host) throw Error('prepare once');
      root=data.root;
      host=await acquire(root,{create:data.create});
      const paths=new Map(), open=host.open;
      host.open=(path,...args)=>{const h=open(path,...args);paths.set(h,path);return h;};
      // Observe only the accepted backend seam; native handles, globals, generated
      // imports and SQLite error mapping remain untouched. Rethrow the same object.
      for(const op of ['write','truncate','sync']) {
        const original=host[op];
        host[op]=(h,...args)=>{
          try {return original(h,...args);}
          catch(e) {
            errors.push({nativeQuota:isNativeQuota(e),name:e.name,code:e.code,message:e.message,
              file:paths.get(h),op,command,at:op==='write'?args[1]:undefined,
              bytes:op==='write'?args[0].length:undefined,size:h.getSize()});
            throw e;
          }
        };
      }
      runtime=await load(await (await fetch('./storage_bg.wasm')).arrayBuffer(),host);
      postMessage({rc:0,secure:isSecureContext,isolated:crossOriginIsolated,sab:typeof SharedArrayBuffer});return;
    }
    if(data.op==='pressure') {
      const directory=await (await navigator.storage.getDirectory()).getDirectoryHandle(root);
      const f=await directory.getFileHandle('quota-filler',{create:true});
      const h=await f.createSyncAccessHandle();
      const before=await navigator.storage.estimate();
      let result;
      try {
        if(h.getSize()!==0) throw Error('filler must be fresh');
        result=await fill(h);
        // Allow real journal writes before the native quota failure in the scan.
        if(result.bytes<16384) throw Error('insufficient filler for journal headroom');
        h.truncate(result.bytes-16384);h.flush();result.retained=h.getSize();
      } finally {h.close();}
      postMessage({...result,before,after:await navigator.storage.estimate()});return;
    }
    if(data.op==='freeFiller') {
      const directory=await (await navigator.storage.getDirectory()).getDirectoryHandle(root);
      await directory.removeEntry('quota-filler');
      postMessage({freed:'quota-filler',estimate:await navigator.storage.estimate()});return;
    }
    if(data.op==='quotaEvidence') {postMessage({errors,trace:runtime.state.trace,traceDropped:runtime.state.traceDropped});return;}
    if(['fault','crash'].includes(data.op)) throw Error('injection forbidden in actual quota harness');
    command=data.op;
    if(command==='walletScan') {errors=[];runtime.state.trace.length=0;runtime.state.traceDropped=0;}
    postMessage(dispatch(runtime.e,runtime.state,host,data));
    command=undefined;
  } catch(e) {postMessage({error:String(e.stack),code:e.name});}
};
