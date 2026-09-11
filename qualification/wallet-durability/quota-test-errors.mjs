// Offline error transport control only. No wallet/database success is simulated.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {errorDetails} from './quota-pressure.mjs';
const original=new DOMException('original native pressure message','UnknownError');
Object.defineProperty(original,'stack',{value:'getDirectory@worker.mjs:1:1'});
let reply;
const context=vm.createContext({DOMException,Error,performance,crypto,
  navigator:{storage:{estimate:async()=>({quota:123,usage:45}),getDirectory:async()=>{throw original;}}},
  postMessage:value=>{reply=JSON.parse(JSON.stringify(value));},onmessage:null});
const worker=new vm.SourceTextModule(fs.readFileSync(new URL('./quota-worker.mjs',import.meta.url),'utf8'),{context});
await worker.link(async name=>{
  if(name==='./quota-pressure.mjs')return new vm.SourceTextModule(fs.readFileSync(new URL(name,import.meta.url),'utf8'),{context});
  const exports={'./opfs.mjs':['acquire'],'./load.mjs':['load'],'./dispatch.mjs':['dispatch']}[name];
  return new vm.SyntheticModule(exports,function(){for(const key of exports)this.setExport(key,()=>{throw Error('wallet execution forbidden in error transport control');});},{context});
});
await worker.evaluate();
await context.onmessage({data:{op:'pressure'}});
assert.equal(reply.name,original.name);assert.equal(reply.message,original.message);
assert.equal(reply.stack,original.stack);assert.equal(reply.nativeCode,original.code);
assert.equal(reply.command,'pressure');assert.equal(reply.pressure.step,'get-directory');
assert.deepEqual(reply.pressure.before,{quota:123,usage:45});
assert.deepEqual(reply.pressure.after,{quota:123,usage:45});
// Exercise the exact suite command-error boundary, without running wallet cases.
const suite=fs.readFileSync(new URL('./quota-suite.mjs',import.meta.url),'utf8');
const callSource=suite.split('\n').find(line=>line.includes('const call=async'));
const rows=[];
const call=Function('w','report','require',`${callSource}\nreturn call;`)(
  {call:async()=>reply},row=>rows.push(row),(v,m)=>{if(!v)throw Error(m);});
let suiteError;
try {await call({op:'pressure'});} catch(e){suiteError=e;}
assert.ok(suiteError);assert.deepEqual(rows[0].failure,reply);
Object.defineProperty(suiteError,'stack',{value:'require@quota-suite.mjs:1:35'});
// Evaluate the actual frozen page failure assignment, including its serializer.
const packagePath=process.argv[2];
const page=fs.readFileSync(`${packagePath}/bundle/browser-test.mjs`,'utf8');
const assignment=page.match(/catch\(e\) \{(outcome=\{pass:false,.*?\};)\}/)[1];
const outcome=Function('e','errorDetails',`let outcome;const results=[],contexts=[],barriers=[];${assignment}return outcome;`)(suiteError,errorDetails);
assert.equal(outcome.pass,false);assert.match(outcome.message,/original native pressure message/);
assert.equal(outcome.stack,suiteError.stack);assert.match(outcome.error,/pressure:/);
console.log('actual worker -> suite command-error -> frozen page serialization control passes; no browser/quota success evidence');
