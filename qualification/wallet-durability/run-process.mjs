function stable(v) { return JSON.stringify(v, (_, x) => x && !Array.isArray(x) && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map(k => [k,x[k]])) : x); }
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { start } from './node-harness.mjs';
function require(v,m){if(!v)throw Error(m);}
function equal(a,b,m){require(stable(a)===stable(b),m);}
const base=process.env.STORAGE_BUNDLE;if(!base)throw Error('explicit STORAGE_BUNDLE');
const root=fs.mkdtempSync('/home/jack/zcash-wallet-durability-scratch/process-');
let w,child,contender;const children=new Set();
const launch=mode=>{const result=`${root}/${mode}.json`;const p=spawn(process.execPath,[new URL('./process-owner.mjs',import.meta.url).pathname,root,result,mode],{stdio:['ignore','inherit','inherit'],env:process.env});children.add(p);p.completion=once(p,'exit');p.on('exit',()=>children.delete(p));return p;};
async function receipt(mode){const deadline=Date.now()+20000;for(;;){try{return JSON.parse(fs.readFileSync(`${root}/${mode}.json`));}catch(e){if(e.code!=='ENOENT')throw e;}if(Date.now()>=deadline)throw Error('process checkpoint timeout');await new Promise(r=>setTimeout(r,25));}}
async function call(command){const r=await w.call(command);require(!r.error,JSON.stringify(r));return r;}
try {
  w=start(root,true);await call({op:'walletOpen',create:true});await call({op:'walletSetup'});const before=await call({op:'walletObserve'});await call({op:'walletClose'});await w.destroy();w=null;
  const inode=fs.statSync(`${root}/owner.lock`).ino;
  child=launch('crash');const checkpoint=await receipt('crash');require(checkpoint.checkpoint?.op==='write','actual checkpoint');
  contender=launch('contend');const contention=await receipt('contend');equal(await contender.completion,[0,null],'contender exit');require(contention.code==='EBUSY','cross-process second writer not rejected');
  child.kill('SIGKILL');const exit=await child.completion;equal(exit,[null,'SIGKILL'],'actual process SIGKILL exit');
  require(fs.statSync(`${root}/owner.lock`).ino===inode,'lock inode changed');
  w=start(root);const files=await call({op:'inspect'});equal(files['wallet.db-journal'].header,[217,213,5,249,32,161,99,215],'hot journal after SIGKILL');
  await call({op:'walletOpen'});equal(await call({op:'walletObserve'}),before,'SIGKILL rollback differs');
  const trace=await call({op:'trace'});require(trace.trace.some(t=>t.op==='write'&&t.file==='wallet.db'),'no actual recovery write');
  await call({op:'walletScan'});const committed=await call({op:'walletObserve',complete:true});
  const reference=JSON.parse(fs.readFileSync(`${base}/reference.json`));equal(committed.canonical,reference.created,'native parity after retry');
  await call({op:'walletClose'});await w.destroy();w=start(root);await call({op:'walletOpen'});equal(await call({op:'walletObserve',complete:true}),committed,'retry not durable');
  await call({op:'walletScan'});equal(await call({op:'walletObserve',complete:true}),committed,'retry not idempotent');await call({op:'walletClose'});
  console.log(JSON.stringify({pass:true,root,base,pid:checkpoint.pid,exit,contention,files,lockInode:inode,recoveryWrites:trace.trace.filter(t=>t.op==='write'&&t.file==='wallet.db').length}));
} catch(e){console.error(e);process.exitCode=1;}
finally {if(w)await w.destroy();for(const p of children)p.kill('SIGKILL');await Promise.allSettled([...children].map(p=>p.completion));}
