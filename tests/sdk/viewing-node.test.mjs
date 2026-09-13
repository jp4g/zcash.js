import {birthdayChecks} from './birthday-checks.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {viewingChecks} from './viewing-checks.mjs';
test('packed public viewing authority and all address operations use actual native codec',async()=>{
  const scratch=await mkdtemp(join(tmpdir(),'packed-viewing-node-'));
  const [pack]=JSON.parse(execFileSync('npm',['pack','--offline','--ignore-scripts','--json','--pack-destination',scratch],{encoding:'utf8'}));
  await mkdir(join(scratch,'consumer'));execFileSync('tar',['-xzf',join(scratch,pack.filename),'-C',join(scratch,'consumer')]);
  const api=await import(pathToFileURL(join(scratch,'consumer/package/dist/src/index.js')));
  const result=await viewingChecks(api);
  assert.deepEqual(result,{operations:7,independentAuthorities:3,cancelled:2,unknownReceivers:true});
  console.log(JSON.stringify({scratch,...result,birthday:await birthdayChecks(api)}));
});
