import { suite } from './suite.mjs';
const results=[], contexts=[], active=new Set(); let index=0, made=0; const barriers=[];
const prefix=`wallet-durability-${crypto.randomUUID()}`;
function makeWorker() {
  const worker=new Worker('./browser-worker.mjs',{type:'module'}); active.add(worker);made++;
  return {
    call(command) {return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{worker.terminate();done(Error('external wallet worker timeout'));},30000);
      const done=(e,v)=>{clearTimeout(timer);worker.removeEventListener('message',message);worker.removeEventListener('error',error);e?reject(e):resolve(v);};
      const message=e=>done(null,e.data); const error=e=>done(Error(e.message));
      worker.addEventListener('message',message);worker.addEventListener('error',error);worker.postMessage(command);
    });},
    async destroy() {
      worker.terminate();active.delete(worker);
      if (active.size) throw Error('lifecycle barrier expects a single owner');
      const deadline=performance.now()+5000;
      for (;;) {
        const response=await fetch('/wallet-realms',{cache:'no-store',signal:AbortSignal.timeout(2000)});
        if(!response.ok) throw Error('external realm observer unavailable');
        const lifecycle=await response.json();
        if(lifecycle.created.length>=made && lifecycle.created.every(r=>lifecycle.destroyed.includes(r))) {
          barriers.push({made,...lifecycle});break;
        }
        if(performance.now()>=deadline) throw Error('external realm destruction not observed');
        await new Promise(r=>setTimeout(r,25));
      }
    }
  };
}
let outcome;
try {
  const reference=await (await fetch('./reference.json')).json();
  const {phase}=await (await fetch('/wallet-phase')).json();
  if(!['all','tracer','interruptions'].includes(phase))throw Error('invalid phase');
  await suite({reference,phase,root:()=>`${prefix}-${index++}`,async start(root,create){
    const deadline=performance.now()+4000;
    for (;;) {
      const w=makeWorker(); const ready=await w.call({op:'prepare',root,create});
      if (!ready.error) {
        if (!ready.secure || ready.isolated || ready.sab!=='undefined') {await w.destroy();throw Error('secure nonisolated no-SAB required');}
        contexts.push(ready);return w;
      }
      await w.destroy();
      if (ready.code!=='NoModificationAllowedError' || performance.now()>=deadline) return {call:async()=>ready,destroy:async()=>{}};
      await new Promise(r=>setTimeout(r,50));
    }
  }},r=>{results.push(r);document.querySelector('#result').textContent=JSON.stringify(results);});
  outcome={pass:true,phase,results,contexts,barriers,userAgent:navigator.userAgent,estimate:await navigator.storage.estimate(),actualQuotaExhaustion:false};
} catch(e) {outcome={pass:false,error:String(e.stack),results,contexts,barriers};}
finally {for(const w of active)w.terminate();}
document.querySelector('#result').textContent=JSON.stringify(outcome,null,2);
await fetch('/result',{method:'POST',body:JSON.stringify(outcome)});
