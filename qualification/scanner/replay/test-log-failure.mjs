// Execute the actual scanner logger and cleanup with a local active wait, no sockets.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, mkdir, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openSync, closeSync } from 'node:fs';
import { spawn } from 'node:child_process';
const runner = new URL('./run-firefox.mjs', import.meta.url);
const source = await readFile(process.argv[2] || runner, 'utf8');
const base = await mkdtemp(join(tmpdir(), 'scanner-log-control-'));
try {
  for (const fault of (process.env.SCANNER_LOG_FAULT ? [process.env.SCANNER_LOG_FAULT] : ['none', 'EISDIR', 'ENOSPC'])) {
    const root = join(base, fault); await mkdir(root);
    let probe = source.replaceAll("'./firefox-", `'${new URL('.', runner).href}firefox-`);
    if (fault !== 'none') probe = probe.replace('const logPath = join(logRoot, `${id}.jsonl`);',
      `const logPath = ${JSON.stringify(fault === 'EISDIR' ? root : '/dev/full')};`);
    const start = probe.indexOf('\ntry {\n  const manifestBytes');
    const end = probe.indexOf('\n} catch (error) {\n  record({ stage: \'failed\'', start);
    assert.ok(start > 0 && end > start, 'actual runner main boundary');
    probe = probe.slice(0, start) + `
let deletes = 0;
globalThis.fetch = async () => { deletes++; if (deletes !== 1) throw Error('duplicate cleanup'); return {ok:true,json:async()=>({value:null})}; };
try {
  session = 'local-control'; endpoint = 'unused';
  record({stage:'active-wait', fault:${JSON.stringify(fault)}});
  await new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, 200);
    stop.signal.addEventListener('abort', () => {clearTimeout(timer); reject(stop.signal.reason);}, {once:true});
  });
  record({stage:'wait-finished'});
  exitCode = 0;` + probe.slice(end);
    const path = join(root, 'probe.mjs'); await writeFile(path, probe);
    const outPath = join(root, 'stdout'), errPath = join(root, 'stderr');
    const out = openSync(outPath, 'wx'), err = openSync(errPath, 'wx');
    let child;
    try {
      child = await new Promise((resolve, reject) => {
        const proc = spawn(process.execPath, [path, '--artifacts', root, '--logs', root, '--scratch', root], {timeout:5000, stdio:['ignore',out,err]});
        proc.on('error', reject);
        proc.on('close', (status, signal) => resolve({status, signal}));
      });
    } finally { closeSync(out); closeSync(err); }
    child.stdout = await readFile(outPath, 'utf8');
    child.stderr = await readFile(errPath, 'utf8');
    const records = child.stdout.trim().split('\n').filter(Boolean).map(JSON.parse);
    console.log(JSON.stringify({fault,status:child.status,signal:child.signal,records,stderr:child.stderr}));
    assert.equal(child.signal, null);
    assert.equal(child.status, fault === 'none' ? 0 : 1);
    assert.equal(records.filter(r => r.stage === 'cleanup').length, 1, 'single cleanup after active wait');
    assert.equal(records.find(r => r.stage === 'cleanup').sessionDeleted, true);
    assert.equal(records.some(r => r.stage === 'wait-finished'), fault === 'none', 'failure aborts active wait');
    if (fault !== 'none') assert.match(records.find(r => r.stage === 'failed').error, new RegExp(fault));
    const result = (await readdir(root)).find(n => /^firefox-.*\.json$/.test(n));
    assert.ok(result, 'cleanup writes result receipt');
    assert.equal(JSON.parse(await readFile(join(root,result),'utf8')).exitCode, child.status);
  }
} finally { await rm(base, {recursive:true, force:true}); }
