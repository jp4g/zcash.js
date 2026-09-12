import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { Server, ServerCredentials } from '@grpc/grpc-js';
import { fixtureResponses, lightClientChecks, methods } from './light-client-fixture.mjs';
import { verifiedPacket } from '../clients/public-transaction-reads-packet.mjs';

test('packed public LightClient uses native gRPC for all methods and releases cancelled calls', { timeout: 30000 }, async t => {
  const scratch = await mkdtemp(join(tmpdir(), 'packed-light-node-'));
  const [pack] = JSON.parse(execFileSync('npm', ['pack', '--offline', '--ignore-scripts', '--json', '--pack-destination', scratch], { encoding: 'utf8' }));
  await mkdir(join(scratch, 'node_modules'));
  execFileSync('tar', ['-xzf', join(scratch, pack.filename), '-C', join(scratch, 'node_modules')]);
  await symlink(resolve('node_modules/@grpc'), join(scratch, 'node_modules/@grpc'));
  const api = await import(pathToFileURL(join(scratch, 'node_modules/package/dist/src/index.js')));
  const { vectors } = await verifiedPacket();
  const vector = vectors.find(v => v.branch === 0x76b809bb), fixture = fixtureResponses(vector);
  const server = new Server(), service = {}, handlers = {}, calls = [], closed = new Set();
  const streaming = new Set(['GetBlockRange', 'GetSubtreeRoots', 'GetTaddressTransactions', 'GetMempoolStream']);
  const stalled = { 'read-stall': 'GetLatestBlock', 'stream-stall': 'GetBlockRange', 'send-stall': 'SendTransaction' };
  const awaiting = new Map();
  for (const method of methods) {
    service[method] = { path: '/cash.z.wallet.sdk.rpc.CompactTxStreamer/' + method, requestStream: false, responseStream: streaming.has(method),
      requestSerialize: Buffer.from, requestDeserialize: Buffer.from, responseSerialize: Buffer.from, responseDeserialize: Buffer.from };
    handlers[method] = (call, callback) => {
      const mode = call.metadata.get('x-fixture-mode')[0] ?? 'good';
      const key = `${method}:${mode}`; calls.push(key);
      if (stalled[mode] === method) {
        call.on('cancelled', () => closed.add(key));
        awaiting.get(key)?.();
        return;
      }
      const response = fixture.response(method);
      if (callback) callback(null, response); else { call.write(response); call.end(); }
    };
  }
  server.addService(service, handlers);
  t.after(() => server.forceShutdown());
  const port = await new Promise((resolve, reject) => server.bindAsync('127.0.0.1:0', ServerCredentials.createInsecure(), (error, port) => error ? reject(error) : resolve(port)));
  const result = await lightClientChecks(api, (mode = 'good') => api.grpc(`http://127.0.0.1:${port}`, {
    sourceId: 'native-fixture', timeoutMs: 5000, maxResponseBytes: 4 * 1024 * 1024, readRetry: { attempts: 3, delayMs: 0 },
    headers: async () => ({ 'x-fixture-mode': mode }),
  }), vector, (method, mode) => {
    const key = `${method}:${mode}`;
    return calls.includes(key) ? Promise.resolve() : new Promise(resolve => awaiting.set(key, resolve));
  });
  const deadline = Date.now() + 3000;
  while (closed.size < 3 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(closed.size, 3);
  assert.equal(calls.filter(v => v === 'SendTransaction:send-stall').length, 1);
  assert.deepEqual(result, { methods: 11, cancelled: 2, broadcastUnknown: 1 });
  await new Promise(resolve => server.tryShutdown(resolve));
  console.log(JSON.stringify({ packed: scratch, ...result, requests: calls.length, cancelledCallsClosed: closed.size, serverClosed: true }));
});
