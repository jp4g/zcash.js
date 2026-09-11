import assert from 'node:assert/strict';
import { isNativeQuota, fill, LIMIT } from './quota-pressure.mjs';
assert.equal(isNativeQuota({name:'QuotaExceededError'}),false);
assert.equal(isNativeQuota(Object.assign(Error('disk'),{code:'ENOSPC'})),false);
assert.equal(isNativeQuota(new DOMException('control only','QuotaExceededError')),true);
assert.equal(isNativeQuota(new DOMException('control only','UnknownError')),false);
// Offline controls only: these handles never qualify browser quota.
let size=0, largest=0;
const h={getSize:()=>size,write(b,{at}){largest=Math.max(largest,at+b.length);size=at+b.length;return b.length;},flush(){}};
await assert.rejects(fill(h),/64 MiB cap/);
assert.equal(size,LIMIT);assert.equal(largest,LIMIT);
size=0;
const full={...h,write(b,{at}){if(at+b.length>100001)throw new DOMException('control only','QuotaExceededError');size=at+b.length;return b.length;}};
const result=await fill(full);
assert.equal(result.bytes,100001);assert.equal(result.errors.at(-1).requested,1);
await assert.rejects(fill({...h,write(){throw Error('unrelated failure');}}),/unrelated failure/);
console.log('quota native-category, byte-cap, refinement and unexpected-error controls pass (not platform evidence)');
