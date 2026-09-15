import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { operation } from '../../dist/src/clients/light-chain-reads.js';

test('completed operation waits do not accumulate promises until cancellation', () => {
  const module = new URL('../../dist/src/clients/light-chain-reads.js', import.meta.url).href;
  execFileSync(process.execPath, ['--expose-gc', '--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { queryObjects } from 'node:v8';
    import { operation } from ${JSON.stringify(module)};
    const pending = operation(undefined);
    const before = queryObjects(Promise);
    for (let i = 0; i < 20000; i++) await pending.wait(i);
    const retained = queryObjects(Promise) - before;
    assert.ok(retained < 20, 'Completed waits retained ' + retained + ' promises');
    pending.cancel();
  `], { stdio: 'pipe' });
});

test('operation waits follow native cancellation and observe late rejection', async () => {
  const caller = new AbortController();
  caller.signal.addEventListener('abort', event => event.stopImmediatePropagation());
  const pending = operation(caller.signal);
  let reject;
  const result = pending.wait(new Promise((_, fail) => { reject = fail; }));
  caller.signal.dispatchEvent(new Event('abort'));
  pending.signal.dispatchEvent(new Event('abort'));
  assert.equal(await pending.wait(1), 1);
  const rejected = assert.rejects(result, { code: 'ABORTED' });
  caller.abort();
  await rejected;
  reject(new Error('late failure'));
  await new Promise(resolve => setImmediate(resolve));
  pending.close();
});
