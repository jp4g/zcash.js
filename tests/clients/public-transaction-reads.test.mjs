import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { build, packet, verifiedPacket } from './public-transaction-reads-packet.mjs';
import { blockOne, fixture, result, transportOptions } from './public-chain-reads-fixtures.mjs';
const { vectors } = await verifiedPacket();
const { initialize } = await import(pathToFileURL(`${packet}/network.mjs`));
const { readFile } = await import('node:fs/promises');
initialize(new Uint8Array(await readFile(`${packet}/bindings_bg.wasm`)));
const { decodeTransaction } = await import(pathToFileURL(`${packet}/transaction.mjs`));
test('real accepted transactions retain exact bytes and mempool observation', async () => {
  const module = await import(pathToFileURL(`${build}/src/clients/public-transaction-reads.js`)).catch(e => {
    if (e.code === 'ERR_MODULE_NOT_FOUND') return {}; throw e;
  });
  assert.equal(typeof module.getTransaction, 'function', 'positive internal read must exist');
  const { http } = await import(pathToFileURL(`${build}/src/http.js`));
  const server = await fixture(call => {
    assert.deepEqual(call.params, [vectors.find(v => v.display === call.params[0]).display, 1]);
    assert.equal(call.method, 'getrawtransaction');
    const v = vectors.find(v => v.display === call.params[0]);
    return result({ txid: v.display, hex: v.hex, in_active_chain: false });
  });
  try {
    for (const v of vectors) {
      const actual = await module.getTransaction({ transport: http(`${server.origin}/rpc`, transportOptions), sourceId: 'fixture' },
        { txid: v.display, decodeTransaction: raw => decodeTransaction(raw, v.branch) }, { txid: v.display });
      assert.equal(Buffer.from(actual.raw).toString('hex'), v.hex);
      assert.equal(actual.observation.state, 'mempool');
      assert.equal(actual.txid, v.display);
    }
    assert.deepEqual(server.unexpected, []);
  } finally { await server.close(); }
});

test('mined transaction composes block reads with a signal and preserves cancellation', async () => {
  const v = vectors[0];
  const { getTransaction } = await import(pathToFileURL(`${build}/src/clients/public-transaction-reads.js`));
  const { http } = await import(pathToFileURL(`${build}/src/http.js`));
  const server = await fixture(call => {
    if (call.method === 'getrawtransaction') return result({ txid: v.display, hex: v.hex,
      in_active_chain: true, blockhash: blockOne.verbose.hash, height: 1, confirmations: 1 });
    if (call.method === 'getblock') return result({ ...blockOne.verbose, nTx: 1, tx: [v.display] });
    return result(call.params[1] ? blockOne.verbose : blockOne.raw);
  });
  const context = { txid: v.display, decodeTransaction: raw => decodeTransaction(raw, v.branch) };
  try {
    const source = { transport: http(`${server.origin}/rpc`, transportOptions), sourceId: 'fixture' };
    const actual = await getTransaction(source, context, { txid: v.display, signal: new AbortController().signal });
    assert.equal(actual.observation.state, 'mined');
    assert.deepEqual(actual.observation.inclusion, { height: 1, blockHash: blockOne.verbose.hash, confirmations: null });
    assert.deepEqual(server.calls.map(call => call.method), ['getrawtransaction', 'getblock', 'getblockheader', 'getblockheader']);

    // Cancellation must cross every nested read even when a caller stops abort events.
    for (let stage = 0; stage < 4; stage++) {
      const controller = new AbortController();
      controller.signal.addEventListener('abort', event => event.stopImmediatePropagation());
      let admitted = 0;
      const before = server.calls.length;
      const transport = http(`${server.origin}/rpc`, { ...transportOptions, headers() {
        if (admitted++ === stage) controller.abort();
        return {};
      } });
      await assert.rejects(getTransaction({ ...source, transport }, context,
        { txid: v.display, signal: controller.signal }), error => error.code === 'ABORTED');
      assert.equal(server.calls.length - before, stage, 'aborted admission sends no next RPC');
    }
    assert.deepEqual(server.unexpected, []);
  } finally { await server.close(); }
});
