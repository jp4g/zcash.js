import assert from 'node:assert/strict';
import test from 'node:test';
import { waitForConfirmation } from '../../examples/testnet/confirmation.mjs';

for (const outcome of ['confirmed', 'scan failure', 'payment failure']) {
  test(`concurrent testnet confirmation: ${outcome} drains and cancels both tasks without submission`, async () => {
    const error = Error(outcome), started = Promise.withResolvers();
    let scanClosed = false, paymentClosed = false;
    const cancelled = signal => new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }));
    const wallet = { async *watchSync({ signal }) {
      try {
        started.resolve();
        if (outcome === 'scan failure') throw error;
        const stopped = cancelled(signal);
        yield { activity: 'running' };
        await stopped;
      } finally { scanClosed = true; }
    } };
    const pending = { async wait({ confirmations, signal }) {
      try {
        const stopped = cancelled(signal);
        await started.promise;
        assert.equal(confirmations, 3);
        if (outcome === 'scan failure') await stopped;
        if (outcome === 'payment failure') throw error;
        return { confirmed: true };
      } finally { paymentClosed = true; }
    } };
    if (outcome === 'confirmed') assert.deepEqual(await waitForConfirmation(wallet, pending), { confirmed: true });
    else await assert.rejects(waitForConfirmation(wallet, pending), actual => actual === error);
    assert.equal(scanClosed, true);
    assert.equal(paymentClosed, true);
  });
}
