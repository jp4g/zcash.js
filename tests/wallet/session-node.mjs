import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Worker} from 'node:worker_threads';
import {pathToFileURL} from 'node:url';
const {initialize}=await import(pathToFileURL(`${process.argv[2]}/tests/wallet-support.mjs`));
const bundle=process.argv[2], fixture=JSON.parse(fs.readFileSync(`${bundle}/tests/views-fixture.json`));
const show=v=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?x.toString():x);
fixture.defaultAddress.index=BigInt(fixture.defaultAddress.index);
const root=fs.mkdtempSync(`${process.env.WALLET_TEST_ROOT}/views-node-`);
function start(create=false,ownedRoot=root) {
  const worker=new Worker(new URL('./views-worker.mjs',import.meta.url),{workerData:{root:ownedRoot,create,bundle},trackUnmanagedFds:true});
  let token,stopped=false; worker.on('exit',()=>{stopped=true;});
  return {
    async call(op,args={},override={}) {
      return new Promise((resolve,reject)=>{
        const done=(e,v)=>{clearTimeout(timer);worker.off('message',message);worker.off('error',error);worker.off('exit',exit);e?reject(e):resolve(v);};
        const timer=setTimeout(()=>{void worker.terminate();done(Error('deadline'));},30000);
        const message=v=>{if(v.ok&&v.instance)token=v;done(null,v);},error=e=>done(e),exit=n=>done(Error(`unexpected worker exit ${n}`));
        worker.once('message',message);worker.once('error',error);worker.once('exit',exit);
        worker.postMessage(op==='initialize'?{...initialize(),...override}:{op,args,generation:token?.generation,instance:token?.instance,...override});
      });
    },
    async destroy(){let timer;try{await Promise.race([worker.terminate(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('destruction deadline')),5000);})]);}finally{clearTimeout(timer);}assert.ok(stopped,'worker exit observed');},
  };
}
let owner=start(true), account,list,token;
const policyAccounts=[];
try {
  token=await owner.call('initialize');assert.equal(token.ok,true,show(token));
  const preimport=await owner.call('account_import',{...fixture.import,birthday:'fullScan'},{abort:'before'});
  assert.equal(preimport.error,'ABORTED');assert.equal(preimport.commit,'none');assert.equal(preimport.writes,0);
  assert.deepEqual((await owner.call('account_list')).result,[]);
  const imported=await owner.call('account_import',{...fixture.import,birthday:'fullScan'});assert.equal(imported.ok,true,show(imported));account=imported.result;
  assert.equal(account.viewOnly,false);assert.equal(account.signerAttached,false);
  for(const input of fixture.policyImports) {
    const before=(await owner.call('account_list')).result;
    const result=await owner.call('account_import',{...input,birthday:'fullScan'},{abort:'duringSync'});
    assert.equal(result.error,'ABORTED');assert.equal(result.commit,'committed');
    const added=(await owner.call('account_list')).result.filter(a=>!before.some(b=>b.id===a.id));
    assert.equal(added.length,1,'committed import reconciles without retry');
    assert.equal(added[0].viewOnly,input.viewOnly);assert.equal(added[0].signerAttached,false);policyAccounts.push(added[0]);
  }

  assert.equal(account.birthdayHeight,1);
  assert.equal((await owner.call('account_get',{accountId:'00000000-0000-0000-0000-000000000000'})).result,null);
  assert.deepEqual((await owner.call('account_get',{accountId:account.id})).result,account);
  const args={accountId:account.id};
  const initial=await owner.call('address_list',args);assert.deepEqual(initial.result,[fixture.defaultAddress]);
  assert.equal((await owner.call('address_current',args)).result,fixture.defaultAddress.address);
  assert.equal((await owner.call('address_next',args)).error,'SYNC_REQUIRED');
  const allocationArgs={...args,request:{format:'transparent'}};
  const next=await owner.call('address_next',allocationArgs);assert.equal(next.ok,true,show(next));
  assert.notEqual(next.result.address,fixture.defaultAddress.address);
  const high=await owner.call('address_at',{...args,index:309485009821345068724781055n,request:{format:'unified',transparent:'omit',sapling:'omit',ironwood:'require'}});
  assert.equal(high.ok,true,show(high));assert.equal(high.result.index,309485009821345068724781055n);
  const transparent=await owner.call('address_next',{...args,request:{format:'transparent'}});assert.equal(transparent.ok,true,show(transparent));assert.deepEqual(transparent.result.receiverTypes,['p2pkh']);
  list=(await owner.call('address_list',args)).result;
  const aborted=await owner.call('address_next',allocationArgs,{abort:'before'});assert.equal(aborted.error,'ABORTED');assert.equal(aborted.commit,'none');assert.equal(aborted.writes,0);
  assert.deepEqual((await owner.call('address_list',args)).result,list);
  const failed=await owner.call('address_next',allocationArgs,{fault:'quota'});assert.equal(failed.ok,false);
  assert.deepEqual((await owner.call('address_list',args)).result,list,'failed write no consumed address');
  const commitFailure=await owner.call('address_at',{...args,index:309485009821345068724781054n,request:{format:'unified',transparent:'omit',sapling:'omit',ironwood:'require'}},{fault:'commit'});assert.equal(commitFailure.ok,false);
  assert.deepEqual((await owner.call('address_list',args)).result,list,'failed commit sync no exposure');
  const post=await owner.call('address_next',allocationArgs,{abort:'duringSync'});assert.equal(post.error,'ABORTED');assert.equal(post.commit,'committed');
  const after=(await owner.call('address_list',args)).result;assert.equal(after.filter(a=>a.receiverTypes.join()==='p2pkh').length,list.filter(a=>a.receiverTypes.join()==='p2pkh').length+1,'one transparent exposure, no replay');list=after;
  assert.equal((await owner.call('account_import',{...fixture.import,birthday:'fullScan',viewingKey:fixture.uivk})).error,'INCOMING_ONLY_WALLET_UNSUPPORTED');
  assert.equal((await owner.call('close')).ok,true);
  assert.equal((await owner.call('close')).ok,true,'idempotent close');
  const closedRead=await owner.call('account_list');
  assert.equal(closedRead.error,'Wallet session is closed.');assert.equal(closedRead.commit,'none');
}finally{await owner.destroy();}
owner=start();
try {
  assert.equal((await owner.call('initialize')).ok,true);
  assert.deepEqual((await owner.call('account_list')).result.map(a=>a.id).sort(),[account,...policyAccounts].map(a=>a.id).sort());
  for(const a of policyAccounts)assert.deepEqual((await owner.call('account_get',{accountId:a.id})).result,a);
  assert.deepEqual((await owner.call('address_list',{accountId:account.id})).result,list);
  assert.equal((await owner.call('close')).ok,true);
  assert.equal((await owner.call('close')).ok,true,'idempotent close');
}finally{await owner.destroy();}
console.log(show({pass:true,accountId:account.id,accounts:1+policyAccounts.length,addresses:list.length,workerDestructions:2,completion:['none','committed'],case:'actual FS account UUID/address close/destroy/reopen; SDK session fullScan, completion retention and lifecycle',root}));
