import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../../dist/src/index.js';
import {signerChecks} from './signer-checks.mjs';
test('custom signer delegates to captured stateful adapter with owned values and real native viewing handles',async()=>{
  assert.deepEqual(await signerChecks(api),{methods:3,ownedBytes:true,actualViewing:true,cancelled:2,verifiedAuthorization:false});
});
