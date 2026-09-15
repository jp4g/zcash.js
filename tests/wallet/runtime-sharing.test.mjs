import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { artifactEndpoint } from '../../dist/src/runtime/artifacts.js';
import { networkDefinition } from '../sdk/light-client-fixture.mjs';

test('per-wallet scan batch sizes share one pending runtime acquisition', async () => {
  if (!mock.module) {
    execFileSync(process.execPath, ['--experimental-test-module-mocks', import.meta.filename],
      { stdio: 'pipe', env: { ...process.env, NODE_TEST_CONTEXT: '' } });
    return;
  }
  let acquisitions = 0, cancellations = 0;
  mock.module('../../dist/src/runtime/artifacts.js', { namedExports: {
    artifactEndpoint,
    acquireArtifacts(_artifact, _policy, signal) {
      acquisitions++;
      return new Promise((_, reject) => {
        signal.addEventListener('abort', () => { cancellations++; reject(Error('acquisition cancelled')); }, { once: true });
      });
    },
  } });
  const { openWalletRuntime } = await import('../../dist/src/runtime/wallet.js');
  const runtime = {
    baseline: { manifestUrl: 'https://example.test/manifest.json', manifestSha256: '01'.repeat(32) },
    threading: { mode: 'baseline' }, maxMemoryBytes: 1024 ** 3,
    maxQueuedJobs: 8, maxQueuedBytes: 65536, maxPcztBytes: 65536,
  };
  const first = new AbortController(), second = new AbortController();
  const open = (scanBatchSize, signal) => openWalletRuntime({ network: networkDefinition(), storage: { kind: 'memory' },
    runtime: { ...runtime, scanBatchSize }, signal });
  const a = assert.rejects(open(1, first.signal), { code: 'ABORTED' });
  const b = assert.rejects(open(8, second.signal), { code: 'ABORTED' });
  try {
    assert.equal(acquisitions, 1);
    first.abort();
    await a;
    assert.equal(cancellations, 0, 'the second wallet still owns its startup lease');
    second.abort();
    await b;
    assert.equal(cancellations, 1);
  } finally {
    first.abort(); second.abort();
    await Promise.allSettled([a, b]);
    mock.reset();
  }
});
