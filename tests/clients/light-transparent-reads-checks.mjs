import { revision, token, utxoBytes, scalar } from './light-transparent-reads-fixtures.mjs';
export async function transparentChecks(address,wire,internal,createTransport,origin) {
 let requests=0,checks=0;
 const assert=(value)=>{if(!value)throw Error('transparent fixture assertion');checks++;};
 const rejects=async(p,code)=>{try{await p;}catch(e){assert(e.code===code);return;}throw Error('expected '+code);};
 for(const method of ['getAddressBalance','getAddressUtxos']) {
  const query=mode=>{requests++;return internal[method](address,wire,{...createTransport(origin+'/?case='+mode,{timeoutMs:2000}),kind:'custom-lightwallet',sourceId:'fixture',protocolRevision:revision},'main',{addresses:[token]});};
  const result=await query('good'); assert(result.sourceId==='fixture');
  if(method==='getAddressBalance')assert(result.value===9007199254740993n);
  else {assert(result.items[0].value===9007199254740993n);assert(result.items[0].script[0]===81);assert(result.tip===null);}
  const empty=await query('default');assert(method==='getAddressBalance'?empty.value===0n:empty.items.length===0);
  if(method==='getAddressUtxos') {
   const suppressed=await query('suppressed-utxo-error');
   assert(suppressed.items.length===0);assert(suppressed.tip===null);
  }
  await rejects(query('malformed'),'PROTOCOL_MISMATCH');
  await rejects(query('missing'),'PROTOCOL_MISMATCH');
  await rejects(query('error'),'TRANSPORT_ERROR');
  const controller=new AbortController();
  let signal, acquired; const ready=new Promise(resolve=>{acquired=resolve;});
  const custom={kind:'custom-lightwallet',sourceId:'fixture',protocolRevision:revision,unary(args){signal=args.signal;acquired();return new Promise(()=>{});}};
  const pending=internal[method](address,wire,custom,'main',{addresses:[token],signal:controller.signal});
  await ready; controller.abort();await rejects(pending,'ABORTED');assert(signal.aborted);
  await rejects(internal[method](address,wire,custom,'test',{addresses:[token]}),'INVALID_ARGUMENT');
  const bytes=method==='getAddressBalance'?scalar(1,9223372036854775808n):utxoBytes();
  custom.unary=()=>bytes;
  if(method==='getAddressBalance')await rejects(internal[method](address,wire,custom,'main',{addresses:[token]}),'PROTOCOL_MISMATCH');
  else {const owned=await internal[method](address,wire,custom,'main',{addresses:[token]});bytes.fill(0);assert(owned.items[0].script[0]===81);}
 }
 return {ok:true,requests,checks};
}
