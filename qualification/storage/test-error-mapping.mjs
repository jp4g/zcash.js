import assert from 'node:assert/strict';
import { mapError, RC } from './storage-host.mjs';
for (const [name, expected] of [['QuotaExceededError', RC.FULL], ['NoModificationAllowedError', RC.BUSY], ['NotAllowedError', RC.READONLY], ['UnknownError', RC.FSYNC]]) {
  const exception = new DOMException('synthetic host control', name);
  assert.equal(typeof exception.code, 'number');
  assert.equal(mapError(exception, RC.FSYNC), expected);
}
for (const [code, expected] of [['ENOSPC', RC.FULL], ['EDQUOT', RC.FULL], ['EBUSY', RC.BUSY], ['EACCES', RC.READONLY], ['EIO', RC.FSYNC]]) {
  assert.equal(mapError(Object.assign(Error('synthetic host control'), { code }), RC.FSYNC), expected);
}
console.log('PASS native DOMException numeric codes use names; injected errors remain labeled injection');
