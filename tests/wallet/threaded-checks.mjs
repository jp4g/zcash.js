import {createWalletClient,createLightClient,defineNetwork} from '../../dist/src/index.js';
import {revision} from '../clients/light-chain-reads-fixtures.mjs';
import {publicWalletResponses} from './public-wallet-checks.mjs';
const check=(ok,label)=>{if(!ok)throw Error(label);};
const hex=value=>Uint8Array.from(value.match(/../g)??[],byte=>parseInt(byte,16));
const encoded=value=>Array.from(value,byte=>byte.toString(16).padStart(2,'0')).join('');
const same=(a,b)=>JSON.stringify(a,(_,v)=>typeof v==='bigint'?String(v):v)===JSON.stringify(b,(_,v)=>typeof v==='bigint'?String(v):v);

// Opt-in existing host lane; native fixture funding is scanned, never proved here.
// Ready compute workers plus the bound native cached-scanner path establish the
// integration exercised. This does not measure scheduler utilization or speedup.
export async function threadedChecks(options,fixture,definition,WorkerType) {
  const network=await defineNetwork(definition),data=fixture.publicWallet;
  const {initialize}=await import('../../dist/src/runtime/lightwire-capsule.mjs'),codec=initialize();
  const responses=await publicWalletResponses(fixture,definition);
  const request=(method,value)=>encoded(codec.encodeRequest(method,JSON.stringify(value)));
  const priorRequest=request('GetTreeState',{height:String(data.import.birthday.firstScanHeight-1)}),priorTreeState=hex(data.import.birthday.priorTreeState);
  const expectedRange=request('GetBlockRange',{start:{height:String(data.target.height)},end:{height:String(data.target.height)}});
  let streams=0;
  const light=createLightClient({network,transport:{kind:'custom-lightwallet',sourceId:'threaded-native-fixture',protocolRevision:revision,
    async unary({method,request:bytes}){if(method==='GetTreeState'&&encoded(bytes)===priorRequest)return priorTreeState;const result=responses.response(method,bytes);check(result.payload,'known native fixture read');return result.payload;},
    async *stream({method,request:bytes,signal}){check(method==='GetBlockRange'&&encoded(bytes)===expectedRange,'exact native funding range');if(signal.aborted)return;streams++;yield hex(data.block);}}});
  const confirmations={trusted:1,untrusted:1,allowZeroConfirmationShielding:false};
  const diagnostics=[],owners=new Set(),children=[],terminated=new Set(),originalPost=WorkerType.prototype.postMessage,originalTerminate=WorkerType.prototype.terminate;
  let fault,triggered=false;
  WorkerType.prototype.postMessage=function(message,...rest){
    if(message?.type==='initialize'){
      if(fault==='child'&&triggered&&!message.workers)check([...owners,...children.map(row=>row.worker)].every(worker=>terminated.has(worker)),'failed domain termination completes before baseline initialization');
      owners.add(this);
    }
    if(message?.type==='compute-initialize'){
      check(message.memory?.buffer instanceof SharedArrayBuffer,'actual shared compute memory');
      children.push({worker:this,index:message.index});
      if(fault==='child'){triggered=true;return Reflect.apply(originalPost,this,[{...message,memory:null},...rest]);}
      const result=Reflect.apply(originalPost,this,[message,...rest]);
      if(fault instanceof AbortController){triggered=true;fault.abort();}
      return result;
    }
    return Reflect.apply(originalPost,this,[message,...rest]);
  };
  WorkerType.prototype.terminate=function(...args){const result=Reflect.apply(originalTerminate,this,args);if(result&&typeof result.then==='function')return result.then(value=>{terminated.add(this);return value;});terminated.add(this);return result;};
  const configured=(name,threaded=true)=>{const input=options(name);return {...input,network,light,confirmations,observation:{pollIntervalMs:1000,maxBufferedUpdates:16},recovery:{mode:'offline'},runtime:{...input.runtime,...(!threaded?{threading:{mode:'baseline'}}:{}),onDiagnostic:value=>diagnostics.push(value)}};};
  let wallet,signer,descriptor;
  try {
    const controller=new AbortController();fault=controller;triggered=false;
    try{await createWalletClient({...configured('cancel'),signal:controller.signal});throw Error('missing bootstrap cancellation');}catch(error){check(error.code==='ABORTED','partial bootstrap cancellation');}
    check(triggered&&children.length>0&&children.every(row=>terminated.has(row.worker)),'canceled real pool children terminated');fault=undefined;
    const beforeFailure=children.length;fault='child';triggered=false;
    wallet=await createWalletClient(configured('failed-child'));
    check(triggered&&children.length>beforeFailure&&children.slice(beforeFailure).every(row=>terminated.has(row.worker)),'failed bootstrap children terminate before fallback ready');
    check(diagnostics.at(-1)?.code==='THREADED_FALLBACK'&&diagnostics.at(-1)?.reason==='bootstrapFailed','explicit fresh baseline after actual child initialization failure');
    check((await wallet.accounts.list()).length===0,'failed startup causes no account mutation');await wallet.close();wallet=undefined;fault=undefined;
    const effects=[];
    for(const threaded of [false,true]){
      const name=threaded?'parallel':'baseline',before=children.length,seen=diagnostics.length;
      wallet=await createWalletClient(configured(name,threaded));
      check(diagnostics[seen]?.code===(threaded?'THREADED_SELECTED':'BASELINE_SELECTED'),'selected runtime cannot be fallback');
      if(threaded)check(children.length-before===2&&new Set(children.slice(before).map(row=>row.index)).size===2,'two actual compute workers ready');
      const imported=await wallet.accounts.import({mnemonic:new TextEncoder().encode(fixture.mnemonic),accountIndex:data.accountIndex,birthday:{network,source:'checkpoint',firstScanHeight:data.import.birthday.firstScanHeight,priorTreeState:hex(data.import.birthday.priorTreeState)}});signer=imported.signer;
      const result=await wallet.sync({target:data.target});check(result.targetReached&&result.scan.scanComplete,'public native scan completes');
      const balance=await wallet.getBalance({accountId:imported.account.id});
      check(balance.amounts.sapling.spendable===40000n,'native Sapling funding scanned');
      if(fixture.ironwoodFunding)check(balance.amounts.ironwood.spendable===40000n,'native Ironwood funding scanned');
      const history=await wallet.getHistory({accountId:imported.account.id});check(history.items.some(row=>row.txid===data.txid),'native funding transaction retained');
      effects.push({amounts:balance.amounts,heights:{tipHeight:result.scan.tipHeight,fullyScannedHeight:result.scan.fullyScannedHeight,maxScannedHeight:result.scan.maxScannedHeight},history:history.items.map(row=>({txid:row.txid,balanceDelta:row.balanceDelta,totalReceived:row.totalReceived}))});
      await wallet.close();wallet=undefined;
      descriptor=await signer.getAccount({network,selector:{kind:'derived',accountIndex:data.accountIndex}});await descriptor.viewing.dispose();descriptor=undefined;
      wallet=await createWalletClient(configured(name,threaded));
      const account=(await wallet.accounts.list())[0];check(account.id===imported.account.id,'native account persists across wallet close');
      check(same((await wallet.getBalance({accountId:account.id})).amounts,balance.amounts),'native balances survive reopen');
      await signer.dispose();signer=undefined;await wallet.close();wallet=undefined;
      if(threaded)check(children.slice(before).every(row=>terminated.has(row.worker)),'last wallet and signer release terminates pool');
    }
    check(same(effects[0],effects[1])&&streams===2,'baseline and threaded native effects match');
    check([...owners].every(worker=>terminated.has(worker)),'all native owners terminated');
    return {workerDestructions:terminated.size,threadedWallet:true,threadedScanParity:true,threadedSignerLifetime:true,threadedBootstrapCleanup:true,computeWorkers:children.length};
  }finally{fault=undefined;try{try{await descriptor?.viewing.dispose();}finally{try{await signer?.dispose();}finally{await wallet?.close();}}}finally{WorkerType.prototype.postMessage=originalPost;WorkerType.prototype.terminate=originalTerminate;}}
}
