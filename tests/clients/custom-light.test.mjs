import assert from 'node:assert/strict';
import test from 'node:test';
import {ownCustomLightTransport} from '../../dist/src/clients/custom-light.js';
import {failure,isZcashError} from '../../dist/src/errors.js';
const revision='lightwire:80575dbe59a9bf2e6b79e2391eb78679c453f1a0477292eb97ea3b58bb6c8b10:d8d0c8aaa5ceec7d5dcc188ef25b04011df2ec0254901620fce982fc13aeb32d';
const base=()=>({kind:'custom-lightwallet',sourceId:'fixture',protocolRevision:revision,unary:async()=>new Uint8Array(),stream:async function*(){}});
const args=(signal)=>({method:'GetLatestBlock',request:new Uint8Array([1]),...(signal?{signal}:{})});
const streamArgs=(signal)=>({...args(signal),method:'GetBlockRange'});
const rejects=(promise,code)=>assert.rejects(promise,e=>isZcashError(e)&&e.code===code);

test('captures only own transport data and owns both request and response bytes',async()=>{
 const source=base();let seen,resolve;const response=new Uint8Array([2]);
 source.unary=request=>{seen=request;return new Promise(done=>resolve=done);};
 const owned=ownCustomLightTransport(source);source.sourceId='changed';source.unary=()=>{throw Error('replacement');};
 const input=args(),pending=owned.unary(input);input.request.fill(9);assert.deepEqual(seen.request,new Uint8Array([1]));
 resolve(response);const result=await pending;response.fill(8);assert.deepEqual(result,new Uint8Array([2]));assert.equal(owned.sourceId,'fixture');
 let calls=0;const accessor=base();Object.defineProperty(accessor,'sourceId',{get(){calls++;return 'secret';}});
 assert.throws(()=>ownCustomLightTransport(accessor),e=>e.code==='INVALID_ARGUMENT');assert.equal(calls,0);
 assert.throws(()=>ownCustomLightTransport({...base(),protocolRevision:'unknown'}),e=>e.code==='PROTOCOL_MISMATCH');
 assert.throws(()=>ownCustomLightTransport(Object.create(base())),e=>e.code==='INVALID_ARGUMENT');
});

test('unary cancellation terminates stalled foreign promises and preserves SDK error identity',async()=>{
 const controller=new AbortController();controller.signal.addEventListener('abort',event=>event.stopImmediatePropagation());
 let signal;const owned=ownCustomLightTransport({...base(),unary:input=>{signal=input.signal;return new Promise(()=>{});}});
 const pending=owned.unary(args(controller.signal));controller.signal.dispatchEvent(new Event('abort'));assert.equal(signal.aborted,false);
 controller.abort();await rejects(pending,'ABORTED');assert.equal(signal.aborted,true);
 const genuine=failure('TRANSPORT_ERROR','transport','configure','Fixed.');
 await assert.rejects(ownCustomLightTransport({...base(),unary(){throw genuine;}}).unary(args()),e=>e===genuine);
 const foreign={get message(){throw Error('read secret');},code:'NOT_FOUND'};
 await rejects(ownCustomLightTransport({...base(),unary(){throw foreign;}}).unary(args()),'TRANSPORT_ERROR');
 await rejects(ownCustomLightTransport({...base(),unary:async()=>new Uint8Array(4*1024*1024+1)}).unary(args()),'RESOURCE_LIMIT');
});

test('stream is lazy, single-pull, owned and return cancels stalled next without waiting for foreign return',async()=>{
 let starts=0,pulls=0,returns=0,signal;const request=new Uint8Array([3]);
 const source={...base(),stream(input){starts++;signal=input.signal;assert.deepEqual(input.request,new Uint8Array([3]));return{[Symbol.asyncIterator](){return this;},next(){pulls++;return new Promise(()=>{});},return(){returns++;return new Promise(()=>{});}};}};
 const stream=ownCustomLightTransport(source).stream({...streamArgs(),request});request.fill(9);assert.equal(starts,0);
 const pending=stream.next();await rejects(stream.next(),'INVALID_ARGUMENT');assert.equal(pulls,1);
 assert.equal((await stream.return()).done,true);await rejects(pending,'ABORTED');assert.equal(signal.aborted,true);assert.equal(returns,1);
 assert.equal((await stream.next()).done,true);assert.equal(pulls,1);
 const bytes=new Uint8Array([5]);const yielding=ownCustomLightTransport({...base(),stream:async function*(){yield bytes;}}).stream(streamArgs());
 const first=await yielding.next();bytes.fill(8);assert.deepEqual(first.value,new Uint8Array([5]));await yielding.return();
});

test('stream cancellation and aggregate byte/message ceilings release the foreign iterator',async()=>{
 const controller=new AbortController();let returned=0;
 const stalled=ownCustomLightTransport({...base(),stream(){return{[Symbol.asyncIterator](){return this;},next(){return new Promise(()=>{});},return(){returned++;throw Error('cleanup');}};}}).stream(streamArgs(controller.signal));
 const pending=stalled.next();controller.abort();await rejects(pending,'ABORTED');assert.equal(returned,1);
 for(const [size,allowed]of [[4*1024*1024,16],[0,65536]]){
  const bytes=new Uint8Array(size);let released=0;
  const stream=ownCustomLightTransport({...base(),stream(){return{[Symbol.asyncIterator](){return this;},next(){return{done:false,value:bytes};},return(){released++;return{done:true};}};}}).stream(streamArgs());
  for(let i=0;i<allowed;i++)assert.equal((await stream.next()).done,false);
  await rejects(stream.next(),'RESOURCE_LIMIT');assert.equal(released,1);
 }
});

test('cancellation during iterator acquisition releases the acquired iterator',async()=>{
 const controller=new AbortController();let releases=0,pulls=0;
 const wrapped=ownCustomLightTransport({...base(),stream(){return{[Symbol.asyncIterator](){controller.abort();return{next(){pulls++;return{done:true};},return(){releases++;return{done:true};}};}};}});
 await rejects(wrapped.stream(streamArgs(controller.signal)).next(),'ABORTED');
 assert.equal(pulls,0);assert.equal(releases,1);
});
