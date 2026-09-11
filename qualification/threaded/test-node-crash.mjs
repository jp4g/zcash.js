import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { Domain } from './domain.mjs';
import { nodeFactory } from './node-adapter.mjs';
const bundle = pathToFileURL(process.argv[2] + '/');
const events = [], children = [];
const factory = nodeFactory(new URL('./node-worker.mjs',import.meta.url),events);
let fallbackCalls = 0;
const d = new Domain({ spawn: (role,index) => { const w=factory(role,index); if(role==='compute') children.push(w); return w; },
  init: { module: await WebAssembly.compile(await readFile(new URL('threaded/qualification_bg.wasm',bundle))), bindingsURL:new URL('threaded/qualification.js',bundle).href },
  fallback: async () => { fallbackCalls++; } });
try {
  await d.start(); assert.equal(await d.call('sql'),42);
  await children[0].crash();
  const until = Date.now()+1000;
  while(d.state==='ready' && Date.now()<until) await new Promise(r=>setTimeout(r,10));
  assert.equal(d.state,'failed'); assert.throws(()=>d.call('cycle'),/not ready/);
  await d.close(); assert.equal(fallbackCalls,0); assert.equal(events.length,3);
  console.log(JSON.stringify({ type:'actual-post-readiness-pool-crash', committedSql:42, fallbackCalls, events }));
} finally { await d.close(); }
