import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { publicResponse, publicClientChecks } from './public-client-fixture.mjs';
import { fixture, transportOptions } from '../clients/public-chain-reads-fixtures.mjs';
import { verifiedPacket } from '../clients/public-transaction-reads-packet.mjs';
test('packed public JSON-RPC client runs all methods and closes cancelled HTTP responses', async () => {
  const scratch=await mkdtemp(join(tmpdir(),'packed-public-node-'));
  const [pack]=JSON.parse(execFileSync('npm',['pack','--offline','--ignore-scripts','--json','--pack-destination',scratch],{encoding:'utf8'}));
  await mkdir(join(scratch,'consumer'));execFileSync('tar',['-xzf',join(scratch,pack.filename),'-C',join(scratch,'consumer')]);
  const api=await import(pathToFileURL(join(scratch,'consumer/package/dist/src/index.js')));
  const {vectors}=await verifiedPacket(),vector=vectors.find(v=>v.branch===0x76b809bb);
  const calls=[],waiting=new Map(),closed=new Set();
  const server=await fixture((call,req,res)=>{
    const mode=req.headers['x-fixture-mode']??'good',key=`${call.method}:${mode}`;calls.push(key);
    if((mode==='read-stall'&&call.method==='getrawtransaction')||(mode==='send-stall'&&call.method==='sendrawtransaction')) {
      res.writeHead(200);res.write('{');res.once('close',()=>closed.add(key));waiting.get(key)?.();return;
    }
    return Object.entries(publicResponse(call,vector,mode)).map(([key,value])=>`${JSON.stringify(key)}:${JSON.stringify(value)}`).join(',');
  });
  try {
    const result=await publicClientChecks(api,(mode='good')=>api.http(server.origin+'/rpc',{...transportOptions,maxResponseBytes:4*1024*1024,headers:()=>({'x-fixture-mode':mode})}),vector,(method,mode)=>{
      const key=`${method}:${mode}`;return calls.includes(key)?Promise.resolve():new Promise(resolve=>waiting.set(key,resolve));
    });
    const deadline=Date.now()+3000;while(closed.size<2&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,10));
    assert.equal(closed.size,2);assert.equal(calls.filter(v=>v==='sendrawtransaction:send-stall').length,1);assert.deepEqual(server.unexpected,[]);
    console.log(JSON.stringify({scratch,...result,closed:closed.size,requests:calls.length}));
  }finally{await server.close();}
});
