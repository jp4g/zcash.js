import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createLightwire } from '/home/jack/zcash-light-transparent-reads-scratch/codec/codec.mjs';
import { createTransparentAddressCodec } from '/home/jack/zcash-light-transparent-reads-scratch/address/codec.mjs';
import { revision, scalar } from './light-chain-reads-fixtures.mjs';
const root = '/home/jack/zcash-light-transparent-reads-scratch';
const wire = createLightwire(readFileSync(root+'/codec/wasm/zakura_lightwire_bg.wasm'));
const address = createTransparentAddressCodec(readFileSync(root+'/address/wasm/zakura_transparent_address_bg.wasm'));
const path = root+'/build/src/clients/light-transparent-reads.js';
const internal = existsSync(path) ? await import(path) : {};
const token = 't1Hsc1LR8yKnbbe3twRp88p6vFfC5t7DLbs';
const transport = bytes => ({kind:'custom-lightwallet',sourceId:'fixture',protocolRevision:revision, unary(){return bytes;}});
test('native unary balance preserves an exact int64 above Number precision',async()=>{
 assert.equal(typeof internal.getAddressBalance,'function','internal balance composition is missing from genuine current build');
 const result=await internal.getAddressBalance(address,wire,transport(scalar(1,9007199254740993n)),'main',{addresses:[token]});
 assert.equal(result.value,9007199254740993n); assert.equal(result.sourceId,'fixture');
});
import { concat, bytesField, hash, display } from './light-chain-reads-fixtures.mjs';
const utxo = ({a=token,index=2,value=9007199254740993n,height=7,txid=hash,script=new Uint8Array([81])}={}) => concat(bytesField(1,txid),scalar(2,index),bytesField(3,script),scalar(4,value),scalar(5,height),bytesField(6,new TextEncoder().encode(a)));
const list = (...items) => concat(...items.map(item=>bytesField(1,item)));
test('finite native UTXO adaptation owns script and reverses this method txid',async()=>{
 assert.equal(typeof internal.getAddressUtxos,'function','internal UTXO composition missing');
 const bytes=list(utxo());
 const result=await internal.getAddressUtxos(address,wire,transport(bytes),'main',{addresses:[token]});
 assert.equal(result.items[0].txid,display(hash)); assert.equal(result.items[0].value,9007199254740993n);
 assert.equal(result.items[0].minedHeight,7); assert.equal(result.tip,null);
 bytes.fill(0); assert.deepEqual(result.items[0].script,new Uint8Array([81]));
});
const code = name => error => error.code===name && !error.message.includes('private-secret');
for (const method of ['getAddressBalance','getAddressUtxos']) {
 const call = (custom,args={addresses:[token]},family='main') => internal[method](address,wire,custom,family,args);
 test(method+' genuine empty/zero and int64 bounds',async()=>{
  const zero=await call(transport(new Uint8Array()));
  assert.deepEqual(method==='getAddressBalance'?zero.value:zero.items,method==='getAddressBalance'?0n:[]);
  for(const n of [9223372036854775808n,18446744073709551615n])
   await assert.rejects(call(transport(method==='getAddressBalance'?scalar(1,n):list(utxo({value:n})))),code('PROTOCOL_MISMATCH'));
  await assert.rejects(call(transport(new Uint8Array([128]))),code('PROTOCOL_MISMATCH'));
 });
 test(method+' native addresses, encoding families and finite input admission',async()=>{
  let calls=0; const custom={...transport(new Uint8Array()),unary(){calls++;return new Uint8Array();}};
  for(const addresses of [[],new Array(101).fill(token),[' '+token],[token+'x'],['u1invalid'],['tex1invalid'],[3]])
   await assert.rejects(call(custom,{addresses}),code('INVALID_ARGUMENT'));
  await assert.rejects(call(custom,{addresses:[token]},'test'),code('INVALID_ARGUMENT'));
  assert.equal(calls,0);
  for(const family of ['test','regtest']) await call(custom,{addresses:['tm9iMLAuYMzJ6jtFLcA7rzUmfreGuKvr7Ma']},family);
  await call(custom,{addresses:['t3JZcvsuaXE6ygokL4XUiZSTrQBUoPYFnXJ']});
 });
 test(method+' cancellation at caller method reads and active IO releases private signal',async()=>{
  for(const site of ['protocolRevision','sourceId','kind','unary']) {
   const c=new AbortController(); let calls=0;
   const custom={...transport(new Uint8Array()),unary(){calls++;return new Uint8Array();}};
   const original=custom[site]; Object.defineProperty(custom,site,{get(){c.abort();return original;}});
   await assert.rejects(call(custom,{addresses:[token],signal:c.signal}),code('ABORTED')); assert.equal(calls,0);
  }
  const pre=new AbortController();pre.abort();let calls=0,signal;
  const custom={...transport(new Uint8Array()),unary(args){calls++;signal=args.signal;return new Promise(()=>{});}};
  await assert.rejects(call(custom,{addresses:[token],signal:pre.signal}),code('ABORTED'));assert.equal(calls,0);
  const c=new AbortController();c.signal.addEventListener('abort',e=>e.stopImmediatePropagation());
  const pending=call(custom,{addresses:[token],signal:c.signal});
  await new Promise(r=>setTimeout(r,10)); c.abort();
  await assert.rejects(pending,code('ABORTED'));assert.equal(signal.aborted,true);
 });
 test(method+' hostile call getter unread, failures sanitized, no retry, owned finite bytes',async()=>{
  let calls=0,signal;
  function unary(args){calls++;signal=args.signal;return new Uint8Array();}
  Object.defineProperty(unary,'call',{get(){throw Error('private-secret');}});
  await call({...transport(),unary});assert.equal(calls,1);assert.equal(signal.aborted,true);
  await assert.rejects(call({...transport(),unary(){throw Error('private-secret');}}),code('TRANSPORT_ERROR'));
  for(const bytes of [[],new Uint8Array(new SharedArrayBuffer(8)),new Uint8Array(4194305)])
   await assert.rejects(call(transport(bytes)),code(bytes.length===4194305?'RESOURCE_LIMIT':'PROTOCOL_MISMATCH'));
 });
}
test('UTXO request has explicit positive sentinel limit and exact caller tokens',async()=>{
 let request;
 const custom={...transport(new Uint8Array()),unary(args){request=args.request;return new Uint8Array();}};
 await internal.getAddressUtxos(address,wire,custom,'main',{addresses:[token,token]});
 assert.deepEqual(request,wire.encodeRequest('GetAddressUtxos',JSON.stringify({addresses:[token,token],start_height:'0',max_entries:1001})));
 for(const item of [utxo({index:18446744073709551615n}),utxo({height:4294967296n}),utxo({txid:new Uint8Array(31)}),utxo({a:'t3JZcvsuaXE6ygokL4XUiZSTrQBUoPYFnXJ'})])
  await assert.rejects(internal.getAddressUtxos(address,wire,transport(list(item)),'main',{addresses:[token]}),code('PROTOCOL_MISMATCH'));
 await assert.rejects(internal.getAddressUtxos(address,wire,transport(list(...Array.from({length:1001},(_,index)=>utxo({index})))),'main',{addresses:[token]}),code('RESOURCE_LIMIT'));
 const result=await internal.getAddressUtxos(address,wire,transport(list(...Array.from({length:1000},(_,index)=>utxo({index})))),'main',{addresses:[token]});
 assert.equal(result.items.length,1000);
});
import { transparentChecks } from './light-transparent-reads-checks.mjs';
import { utxoBytes } from './light-transparent-reads-fixtures.mjs';
import { base64, frame, trailer, media } from './grpc-web-fixtures.mjs';
const { createGrpcWebByteTransport } = await import(root+'/build/src/clients/grpc-web.js');
test('shared browser checks execute actual codecs and gRPC-Web bytes on Node synthetic fetch',async t=>{
 t.mock.method(globalThis,'fetch',async url=>{
  const u=new URL(url);const mode=u.searchParams.get('case');
  let bytes=u.pathname.endsWith('GetTaddressBalance')?scalar(1,9007199254740993n):utxoBytes();
  if(mode==='default')bytes=new Uint8Array();if(mode==='malformed')bytes=new Uint8Array([128]);
  const end=mode==='missing'?new Uint8Array():mode==='error'?trailer('grpc-status: 13\r\ngrpc-message: private-secret\r\n'):trailer();
  return new Response(base64(concat(frame(bytes),end)),{headers:{'content-type':media}});
 });
 const result=await transparentChecks(address,wire,internal,createGrpcWebByteTransport,'http://fixture.invalid');
 assert.equal(result.ok,true);assert.equal(result.requests,10);
});
test('abort inside unary consumes its rejected promise without unhandled rejection',async()=>{
 const c=new AbortController();
 await assert.rejects(internal.getAddressBalance(address,wire,{...transport(),unary(){c.abort();return Promise.reject(Error('private-secret'));}},'main',{addresses:[token],signal:c.signal}),code('ABORTED'));
 await new Promise(r=>setTimeout(r,10));
});
