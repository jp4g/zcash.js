import assert from 'node:assert/strict';
import { test } from 'node:test';
import { grpc, grpcBinding } from '../../dist/src/grpc.js';

test('gRPC descriptors own lazy configuration and preserve explicit ports', () => {
  const options = { sourceId: 'fixture', timeoutMs: 1000, maxResponseBytes: 4096,
    readRetry: { attempts: 2, delayMs: 0 }, headers: () => { throw Error('must stay lazy'); } };
  const transport = grpc('http://localhost:80', options);
  options.sourceId = 'changed'; options.readRetry.attempts = 99;
  assert.equal(grpcBinding(transport).url, 'http://localhost:80');
  assert.equal(grpcBinding(transport).options.sourceId, 'fixture');
  assert.equal(grpcBinding(transport).options.readRetry.attempts, 2);
  assert.ok(Object.isFrozen(transport));
  assert.throws(() => grpcBinding({}), { code: 'INVALID_ARGUMENT' });
  const hostile = { ...options };
  Object.defineProperty(hostile, 'timeoutMs', { get() { throw Error('getter executed'); } });
  assert.throws(() => grpc('http://localhost', hostile), { code: 'INVALID_ARGUMENT' });
  for (const url of ['http://user:password@localhost', 'http://localhost?token=secret', 'http://localhost/path'])
    assert.throws(() => grpc(url, options), { code: 'INVALID_ARGUMENT' });
});
