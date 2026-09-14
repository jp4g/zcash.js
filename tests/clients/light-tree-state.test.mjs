import assert from 'node:assert/strict';
import test from 'node:test';
import { fixtureCodec, revision, bytesField, scalar, concat, hash, display } from './light-chain-reads-fixtures.mjs';
const { codec } = await fixtureCodec();
const { getTreeState } = await import('../../dist/src/clients/light-chain-reads.js');
const network = Object.freeze({ identity: 'synthetic-regtest', genesisHash: display(hash) });
const text = (field, value) => bytesField(field, new TextEncoder().encode(value));
const state = ({ height = 7, network = 'regtest', h = display(hash), sapling = '000000', ironwood = '' } = {}) =>
  concat(text(1, network), scalar(2, height), text(3, h), text(5, sapling), text(7, ironwood));
const transport = unary => ({ kind: 'custom-lightwallet', sourceId: 'fixture', protocolRevision: revision, unary });
test('real codec preserves display hash, frontiers and owned encoded bytes for height/hash selectors', async () => {
  for (const selector of [{ height: 7 }, { hash: display(hash) }, { height: 0 }]) {
    const height = selector.height === 0 ? 0 : 7;
    const encoded = state({ height });
    const source = transport(async ({ method, request }) => {
      assert.equal(method, 'GetTreeState');
      assert.deepEqual(request, codec.encodeRequest(method, JSON.stringify(selector.height === 7
        ? { height: '7' } : { hash: display(hash) })));
      return encoded;
    });
    const result = await getTreeState(codec, source, network, 'regtest', selector);
    assert.equal(result.network, network); assert.equal(result.sourceId, 'fixture');
    assert.deepEqual(result.point, { height, hash: display(hash) });
    assert.deepEqual(result.sapling, new Uint8Array(3)); assert.equal(result.ironwood, null);
    assert.deepEqual(result.encoded, encoded); encoded.fill(255);
    assert.notEqual(result.encoded[0], 255);
  }
});
test('invalid selectors reject before transport; mismatched endpoint evidence never becomes absence', async () => {
  let calls = 0;
  const source = transport(async () => { calls++; return state(); });
  for (const selector of [{}, { height: -1 }, { height: 2 ** 32 }, { height: 7, hash: display(hash) }]) {
    await assert.rejects(getTreeState(codec, source, network, 'regtest', selector), { code: 'INVALID_ARGUMENT' });
  }
  assert.equal(calls, 0);
  for (const [value, selector, code] of [
    [{ height: 8 }, { height: 7 }, 'PROTOCOL_MISMATCH'],
    [{ network: 'test' }, { height: 7 }, 'NETWORK_MISMATCH'],
    [{ height: 2n ** 32n }, { height: 7 }, 'PROTOCOL_MISMATCH'],
    [{ h: 'ab'.repeat(32) }, { hash: display(hash) }, 'PROTOCOL_MISMATCH'],
    [{ height: 0, h: 'ab'.repeat(32) }, { height: 0 }, 'NETWORK_MISMATCH'],
    [{ sapling: '0' }, { height: 7 }, 'PROTOCOL_MISMATCH'],
  ]) await assert.rejects(getTreeState(codec, transport(async () => state(value)), network, 'regtest', selector), { code });
});
test('cancellation stops a stalled native-codec request, and protocol failures remain failures', async () => {
  const controller = new AbortController();
  controller.signal.addEventListener('abort', event => event.stopImmediatePropagation());
  let started;
  const start = new Promise(resolve => { started = resolve; });
  let transportSignal;
  const pending = getTreeState(codec, transport(({ signal }) => {
    transportSignal = signal; started(); return new Promise(() => {});
  }), network, 'regtest', { height: 7, signal: controller.signal });
  await start; controller.signal.dispatchEvent(new Event('abort'));
  assert.equal(transportSignal.aborted, false); controller.abort();
  await assert.rejects(pending, { code: 'ABORTED' }); assert.equal(transportSignal.aborted, true);
  await assert.rejects(getTreeState(codec, transport(async () => new Uint8Array([255])), network, 'regtest', { height: 7 }), { code: 'PROTOCOL_MISMATCH' });
});
