import assert from 'node:assert/strict';
import test from 'node:test';
import { defineNetwork, createLightClient } from '../../dist/src/index.js';
import { revision, scalar, bytesField, concat, tipBytes, blockBytes } from '../clients/light-chain-reads-fixtures.mjs';
import { token } from '../clients/light-transparent-reads-fixtures.mjs';
import { verifiedPacket } from '../clients/public-transaction-reads-packet.mjs';

const text = (n, value) => bytesField(n, new TextEncoder().encode(value));
async function fixture(branch = 0x76b809bb) {
  const { vectors } = await verifiedPacket();
  const vector = vectors.find(v => v.branch === branch);
  const raw = Uint8Array.from(Buffer.from(vector.hex, 'hex'));
  const network = await defineNetwork({ identity: 'synthetic', genesisHash: '03'.repeat(32), parametersFormat: 'zcash-js-network/1',
    parameters: new TextEncoder().encode('{"encoding":"main","Overwinter":10,"Sapling":20,"Blossom":30,"Heartwood":40,"Canopy":50,"Nu5":60,"Nu6":70,"Nu6_1":80,"Nu6_2":90,"Nu6_3":100}') });
  const state = { calls: [], returns: 0, transactionHeight: 20, send: async () => new Uint8Array() };
  const transaction = height => concat(bytesField(1, raw), scalar(2, height));
  const transport = { kind: 'custom-lightwallet', sourceId: 'fixture', protocolRevision: revision,
    async unary(args) {
      state.calls.push(args.method);
      switch (args.method) {
        case 'GetLightdInfo': return concat(text(1, 'fixture'), text(2, 'synthetic'), text(4, 'main'), scalar(5, 20), text(6, '76b809bb'), scalar(7, 20), text(18, 'v0.5.0'));
        case 'GetTreeState': return concat(text(1, 'main'), text(3, network.genesisHash));
        case 'GetLatestBlock': return tipBytes(20);
        case 'GetTransaction': return transaction(state.transactionHeight);
        case 'GetTaddressBalance': return scalar(1, 42);
        case 'GetAddressUtxos': return new Uint8Array();
        case 'SendTransaction': return state.send(args);
        default: throw Error('unexpected method');
      }
    },
    stream(args) {
      state.calls.push(args.method);
      const value = args.method === 'GetBlockRange' ? blockBytes(20)
        : args.method === 'GetSubtreeRoots' ? concat(bytesField(2, new Uint8Array(32).fill(1)), bytesField(3, new Uint8Array(32).fill(2)), scalar(4, 20))
        : transaction(args.method === 'GetMempoolStream' ? 0 : 20);
      let done = false;
      return { [Symbol.asyncIterator]() { return this; },
        async next() { if (done) return { done: true }; done = true; return { done: false, value }; },
        async return() { state.returns++; return { done: true }; } };
    },
  };
  return { client: createLightClient({ network, transport }), state, raw, vector };
}

test('complete light factory composes all eleven methods with actual native codecs', async () => {
  const { client, state, raw, vector } = await fixture();
  assert.equal(state.calls.length, 0);
  assert.equal((await client.getTip()).height, 20);
  assert.deepEqual(state.calls, ['GetLightdInfo', 'GetTreeState', 'GetLatestBlock']);
  assert.equal((await client.getServerInfo()).networkIdentity, 'synthetic');
  assert.equal((await client.getTreeState({ height: 0 })).point.hash, client.network.genesisHash);
  assert.equal((await client.getAddressBalance({ addresses: [token] })).value, 42n);
  assert.deepEqual((await client.getAddressUtxos({ addresses: [token] })).items, []);
  assert.equal((await client.getTransaction({ txid: vector.display })).observation.inclusion.height, 20);
  for (const stream of [client.streamCompactBlocks({ fromHeight: 20, toHeight: 20 }),
    client.getSubtreeRoots({ pool: 'sapling', startIndex: 0n, limit: 1 }),
    client.streamAddressTransactions({ address: token, fromHeight: 20, toHeight: 20 }), client.streamMempool()]) {
    const items = []; for await (const item of stream) items.push(item); assert.equal(items.length, 1);
  }
  assert.equal((await client.broadcastTransaction({ bytes: raw })).outcome, 'acknowledged');
  assert.equal(state.calls.filter(v => v === 'SendTransaction').length, 1);
  assert.equal(state.returns, 4);
});

test('public broadcast preserves unknown outcome after dispatched cancellation', async () => {
  const { client, state, raw } = await fixture();
  let dispatch; const dispatched = new Promise(resolve => { dispatch = resolve; });
  state.send = () => { dispatch(); return new Promise(() => {}); };
  const controller = new AbortController();
  const result = client.broadcastTransaction({ bytes: raw, signal: controller.signal });
  await dispatched; controller.abort();
  assert.equal((await result).outcome, 'unknown');
  assert.equal(state.calls.filter(v => v === 'SendTransaction').length, 1);
});

test('unmined native decoding admits registered branches independent of current tip', async () => {
  const { client, state, vector } = await fixture(0xc2d6d0b4);
  state.transactionHeight = 18446744073709551615n;
  assert.equal((await client.getTransaction({ txid: vector.display })).observation.state, 'offMainChain');
  assert.equal(state.calls.includes('GetLatestBlock'), false);
  const stream = client.streamAddressTransactions({ address: 'invalid', fromHeight: 20, toHeight: 20 });
  await assert.rejects(stream.next(), { code: 'INVALID_ARGUMENT' });
});
