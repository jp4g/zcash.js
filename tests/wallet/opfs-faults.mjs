// One real native owner per worker. The page terminates paused owners and children.
import {fill,isNativeQuota} from '../../qualification/wallet-durability/quota-pressure.mjs';
const hex = value => Uint8Array.from(value.match(/../g) ?? [], x => parseInt(x,16));
const check = (ok,label) => { if(!ok) throw Error(label); };
const plain = value => JSON.stringify(value,(_,v)=>typeof v==='bigint'?String(v):v);
async function run(data) {
  const facade = await import(data.moduleUrl);
  const wasm = new Uint8Array(await(await fetch(`${data.prefix}/bindings_bg.wasm`)).arrayBuffer());
  let runtime;
  if(data.threaded) {
    const ready = new Promise(resolve => self.onmessage = ({data}) => { if(data.poolReady) resolve(); });
    postMessage({pool:facade.prepareThreaded(wasm,2)});
    await ready; runtime=facade.finishThreaded();
  } else runtime=facade.initializeWalletRuntime(wasm);
  const {acquire}=await import(`${data.prefix}/opfs.mjs`);
  const backend=await acquire(data.root,{create:true});
  let owner;
  try {
    if(data.seed){const h=backend.open('wallet.db',true);backend.write(h,hex(data.seed),0);backend.sync(h);}
    const paths=new Map(),open=backend.open;
    backend.open=(path,...args)=>{const h=open(path,...args);paths.set(h,path);return h;};
    let armed=data.action==='migration',journalFlushed=false;
    const quota=[];
    for(const operation of ['write','truncate','sync']) {
      const original=backend[operation];
      backend[operation]=(...args)=>{
        const path=paths.get(args[0]);
        try {
          const value=original(...args);
          if(operation==='write'&&Number.isInteger(value)&&value>=0&&value<args[1].length)quota.push({path,operation,kind:'short-write',requested:args[1].length,returned:value});
          if(armed&&operation==='sync'&&path==='wallet.db-journal')journalFlushed=true;
          if(armed&&journalFlushed&&operation==='write'&&path==='wallet.db') {
            postMessage({paused:true,path,operation,offset:args[2],bytes:args[1].length});
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0);
            throw Error('unexpected interruption resume');
          }
          return value;
        } catch(error) {
          if(isNativeQuota(error))quota.push({path,operation,name:error.name,message:error.message});
          throw error;
        }
      };
    }
    const storage=runtime.open(backend,data.network.parametersFormat,data.network.parameters,hex(data.network.genesisHash));
    owner=facade.viewsForStorage(storage);
    const call=(op,args={})=>owner.call(owner.generation,owner.instance,op,args);
    const accounts=call('account_list'),accountId=accounts[0]?.id;
    check(accountId,'fixture account missing');
    const snapshot=()=>({accounts:call('account_list'),addresses:call('address_list',{accountId}),current:call('address_current',{accountId,request:{format:'transparent'}}),balance:call('account_balance',{accountId,confirmations:{trusted:1,untrusted:1,allowZeroConfirmationShielding:true}})});
    if(data.root.endsWith('-legacy'))for(const query of data.legacy.queries){
      const {scan,...balance}=call('account_balance',query.args);
      check(plain(balance)===plain(query.expected),'migrated native balance query');
      const {revision,...state}=scan;check(plain(state)===plain(query.scan),'migrated scan state');
    }
    if(data.action==='snapshot')return snapshot();
    if(data.action==='migration')throw Error('migration did not reach interruption point');
    const next=()=>call('address_next',{accountId,request:{format:'transparent'}});
    if(data.action==='interrupt'){armed=true;journalFlushed=false;next();throw Error('write did not reach interruption point');}
    if(data.action==='next'){const allocated=next(),state=snapshot();check(state.current===allocated.address&&state.addresses.some(row=>row.address===allocated.address),'allocated address is current and listed');return state;}
    if(data.action==='quota') {
      const directory=await(await navigator.storage.getDirectory()).getDirectoryHandle(data.root);
      const filler=await(await directory.getFileHandle('quota-filler',{create:true})).createSyncAccessHandle();
      try {
        const pressure=await fill(filler);let failed;
        try{next();}catch(error){failed=error;}
        // Firefox may expose its native no-space exception instead of a DOMException.
        const exhausted=pressure.errors.length>0||pressure.probe?.nativeQuota||pressure.probe?.name==='NS_ERROR_FILE_NO_DEVICE_SPACE';
        check(exhausted&&failed&&quota.some(item=>['wallet.db','wallet.db-journal'].includes(item.path)),`actual wallet VFS quota failure required: ${plain({failed:String(failed),quota,probe:pressure.probe})}`);
        return {nativeQuota:true,callbacks:quota,fillerBytes:pressure.bytes,saturation:pressure.saturation,probe:pressure.probe,error:String(failed)};
      } finally {filler.truncate(0);filler.flush();filler.close();}
    }
    throw Error('unknown action');
  } finally {
    try{if(owner)owner.close(owner.generation,owner.instance);}finally{backend.release();}
  }
}
self.onmessage=({data})=>{self.onmessage=null;run(data).then(result=>postMessage({result}),error=>postMessage({error:String(error),stack:error.stack}));};
