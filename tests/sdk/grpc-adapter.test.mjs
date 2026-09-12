import assert from 'node:assert/strict';
import test from 'node:test';
import {Server,ServerCredentials,status} from '@grpc/grpc-js';
import {grpc,grpcAdapter} from '../../dist/src/grpc.js';
const options={sourceId:'fixture',timeoutMs:1000,readRetry:{attempts:3,delayMs:0},maxResponseBytes:1024};
async function fixture(t,handler) {
  const server=new Server(),service={},implementation={};
  for(const method of ['GetLatestBlock','SendTransaction','GetBlockRange']) {
    service[method]={path:'/cash.z.wallet.sdk.rpc.CompactTxStreamer/'+method,requestStream:false,responseStream:method==='GetBlockRange',requestSerialize:Buffer.from,requestDeserialize:Buffer.from,responseSerialize:Buffer.from,responseDeserialize:Buffer.from};
    implementation[method]=(call,callback)=>handler(method,call,callback);
  }
  server.addService(service,implementation);t.after(()=>server.forceShutdown());
  const port=await new Promise((resolve,reject)=>server.bindAsync('127.0.0.1:0',ServerCredentials.createInsecure(),(error,port)=>error?reject(error):resolve(port)));
  return extra=>grpcAdapter(grpc(`http://127.0.0.1:${port}`,{...options,...extra}));
}
test('lazy native adapter owns bytes, retries reads, never replays send/streams, bounds responses',async t=>{
  const counts={};
  const create=await fixture(t,(method,call,callback)=>{
    counts[method]=(counts[method]??0)+1;
    if(method==='GetBlockRange'){call.write(Buffer.from([1]));call.emit('error',{code:status.UNAVAILABLE});return;}
    if(method==='SendTransaction'||counts[method]<3){callback({code:status.UNAVAILABLE});return;}
    callback(null,call.request);
  });
  const adapter=create(),request=new Uint8Array([8,7]);
  const pending=adapter.unary({method:'GetLatestBlock',request});request.fill(0);
  assert.deepEqual(await pending,new Uint8Array([8,7]));assert.equal(counts.GetLatestBlock,3);
  await assert.rejects(adapter.unary({method:'SendTransaction',request}),e=>e.code==='TRANSPORT_ERROR');assert.equal(counts.SendTransaction,1);
  const stream=adapter.stream({method:'GetBlockRange',request})[Symbol.asyncIterator]();
  await assert.rejects(async()=>{for await(const item of {[Symbol.asyncIterator]:()=>stream})void item;});assert.equal(counts.GetBlockRange,1);
  await assert.rejects(create({maxResponseBytes:1}).unary({method:'GetLatestBlock',request:new Uint8Array([1,2])}),e=>e.code==='RESOURCE_LIMIT');
});
test('abort and stream return during lazy startup dispatch nothing; retry sleep is cancellable',async t=>{
  let calls=0,headers=0;
  let first;const received=new Promise(resolve=>{first=resolve;});
  const create=await fixture(t,(_method,_call,callback)=>{calls++;first();callback({code:status.UNAVAILABLE});});
  const adapter=create({headers:async()=>{headers++;return {};},readRetry:{attempts:3,delayMs:10000}});
  const controller=new AbortController();
  const pending=adapter.unary({method:'GetLatestBlock',request:new Uint8Array(),signal:controller.signal});controller.abort();
  await assert.rejects(pending,e=>e.code==='ABORTED');assert.equal(headers,0);assert.equal(calls,0);
  const stream=adapter.stream({method:'GetBlockRange',request:new Uint8Array()})[Symbol.asyncIterator]();
  const next=stream.next();const rejected=assert.rejects(next,e=>e.code==='ABORTED');await stream.return();await rejected;
  assert.equal(headers,0);assert.equal(calls,0);
  const stop=new AbortController();const read=adapter.unary({method:'GetLatestBlock',request:new Uint8Array(),signal:stop.signal});
  await received;await new Promise(resolve=>setTimeout(resolve,25));stop.abort();await assert.rejects(read,e=>e.code==='ABORTED');assert.equal(calls,1);
});
test('definitive status is not retried and configured response size is enforced',async t=>{
  let calls=0;
  const reject=await fixture(t,(_method,_call,callback)=>{calls++;callback({code:status.PERMISSION_DENIED});});
  await assert.rejects(reject().unary({method:'GetLatestBlock',request:new Uint8Array()}));assert.equal(calls,1);
  const oversized=await fixture(t,(_method,_call,callback)=>callback(null,Buffer.from([1,2])));
  await assert.rejects(oversized({maxResponseBytes:1}).unary({method:'GetLatestBlock',request:new Uint8Array()}),e=>e.code==='RESOURCE_LIMIT');
});
