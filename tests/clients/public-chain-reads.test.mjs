import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture, result, sourceId, hashA, hashB, transportOptions } from './public-chain-reads-fixtures.mjs';

const build = process.env.PUBLIC_CHAIN_READS_BUILD ?? '/home/jack/zcash-public-chain-reads-scratch/check/dist';
const { http } = await import(`${build}/src/http.js`);
const adapter = await import(`${build}/src/clients/public-chain-reads.js`).catch(error => {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  return {};
});
async function local(t, respond, options = {}) {
  const server = await fixture(respond);
  t.after(() => server.close());
  return { ...server, context: { sourceId, transport: http(server.origin + '/rpc', { ...transportOptions, ...options }) } };
}

test('getTip returns the coherent blocks/bestblockhash pair in one RPC', async t => {
  assert.equal(typeof adapter.getTip, 'function');
  const f = await local(t, () => result({ blocks: 9, bestblockhash: hashA, headers: 99, estimatedheight: 101 }));
  const before = Date.now();
  const tip = await adapter.getTip(f.context);
  assert.deepEqual({ ...tip, observedAt: undefined }, { height: 9, hash: hashA, sourceId, observedAt: undefined });
  assert.ok(Date.parse(tip.observedAt) >= before && Date.parse(tip.observedAt) <= Date.now());
  assert.equal(new Date(tip.observedAt).toISOString(), tip.observedAt);
  assert.deepEqual(f.calls.map(({ method, params }) => ({ method, params })), [{ method: 'getblockchaininfo', params: [] }]);
});

const code = expected => error => error.code === expected;
test('tip rejects malformed response shapes, lossless numeric tokens and display hashes', async t => {
  let payload;
  const f = await local(t, () => `"result":${payload}`);
  for (const blocks of ['-1', '4294967296', '9007199254740993', '1.0', '1e0', '1.2', '"1"', 'null', 'true', '{}', '-0']) {
    payload = `{"blocks":${blocks},"bestblockhash":"${hashA}"}`;
    await assert.rejects(adapter.getTip(f.context), code('PROTOCOL_MISMATCH'), blocks);
  }
  for (const bad of [null, [], 1, {}, { blocks: 1 }, { blocks: 1, bestblockhash: hashA.toUpperCase() },
    { blocks: 1, bestblockhash: '0x' + hashA }, { blocks: 1, bestblockhash: hashA.slice(1) }]) {
    payload = JSON.stringify(bad);
    await assert.rejects(adapter.getTip(f.context), code('PROTOCOL_MISMATCH'), payload);
  }
  for (const blocks of [0, 4294967295]) {
    payload = JSON.stringify({ blocks, bestblockhash: hashA });
    assert.equal((await adapter.getTip(f.context)).height, blocks);
  }
});

test('invalid source and operation arguments reject before dispatch', async t => {
  const f = await local(t, () => result({ blocks: 1, bestblockhash: hashA }));
  for (const source of [null, {}, { ...f.context, sourceId: '' }, { ...f.context, sourceId: '  ' },
    { ...f.context, sourceId: 1 }, { ...f.context, extra: true }, { ...f.context, transport: {} }]) {
    await assert.rejects(adapter.getTip(source), code('INVALID_ARGUMENT'));
  }
  for (const args of [null, [], { extra: 1 }, { signal: {} }, Object.create({ signal: undefined }),
    Object.defineProperty({}, 'signal', { get() { throw Error('foreign'); } })]) {
    await assert.rejects(adapter.getTip(f.context, args), code('INVALID_ARGUMENT'));
  }
  assert.equal(f.calls.length, 0);
});

test('header resolves a height then requests actual raw bytes by hash across a reorg', async t => {
  assert.equal(typeof adapter.getBlockHeader, 'function');
  const { blockOne } = await import('./public-chain-reads-fixtures.mjs');
  const f = await local(t, call => {
    if (call.params[1]) return result(blockOne.verbose);
    // A height lookup now resolves another block. Only the pinned hash returns the original.
    return result(call.params[0] === blockOne.verbose.hash ? blockOne.raw : '00');
  });
  const header = await adapter.getBlockHeader(f.context, { height: 1 });
  assert.deepEqual({ ...header, observedAt: undefined, raw: undefined }, {
    point: { height: 1, hash: blockOne.verbose.hash }, previousHash: blockOne.verbose.previousblockhash,
    time: blockOne.verbose.time, sourceId, observedAt: undefined, raw: undefined,
  });
  assert.ok(header.raw instanceof Uint8Array);
  assert.equal(Buffer.from(header.raw).toString('hex'), blockOne.raw);
  assert.deepEqual(f.calls.map(({ method, params }) => ({ method, params })), [
    { method: 'getblockheader', params: ['1', true] },
    { method: 'getblockheader', params: [blockOne.verbose.hash, false] },
  ]);
});

test('header requires exactly one uint32 height or canonical display hash before dispatch', async t => {
  const { blockOne } = await import('./public-chain-reads-fixtures.mjs');
  const f = await local(t, call => result(call.params[1] ? blockOne.verbose : blockOne.raw));
  for (const selector of [undefined, null, [], {}, { height: 1, hash: hashA }, { height: 1, hash: undefined },
    { hash: hashA, height: undefined }, { height: -1 }, { height: 4294967296 }, { height: NaN },
    { height: 1.5 }, { height: 1n }, { height: '1' }, { hash: hashA.toUpperCase() }, { hash: '0x' + hashA },
    { hash: hashA.slice(1) }, { hash: 1 }, { height: 1, unknown: true }, { height: 1, signal: {} }]) {
    await assert.rejects(adapter.getBlockHeader(f.context, selector), code('INVALID_ARGUMENT'));
  }
  assert.equal(f.calls.length, 0);
  await adapter.getBlockHeader(f.context, { hash: blockOne.verbose.hash });
  assert.deepEqual(f.calls[0].params, [blockOne.verbose.hash, true]);
});

test('header rejects returned selector mismatch before the raw request', async t => {
  const { blockOne } = await import('./public-chain-reads-fixtures.mjs');
  const f = await local(t, call => result(call.params[1] ? blockOne.verbose : blockOne.raw));
  await assert.rejects(adapter.getBlockHeader(f.context, { height: 2 }), code('PROTOCOL_MISMATCH'));
  await assert.rejects(adapter.getBlockHeader(f.context, { hash: hashB }), code('PROTOCOL_MISMATCH'));
  assert.ok(f.calls.every(call => call.params[1] === true));
});

test('source genesis vectors retain required zero previous hash and owned bytes', async t => {
  const { genesis, regtestGenesis } = await import('./public-chain-reads-fixtures.mjs');
  for (const vector of [genesis, regtestGenesis]) {
    const f = await local(t, call => result(call.params[1] ? vector.verbose : vector.raw));
    const before = Date.now();
    const first = await adapter.getBlockHeader(f.context, { height: 0 });
    assert.equal(first.previousHash, '00'.repeat(32));
    assert.equal(first.point.hash, vector.verbose.hash);
    assert.ok(Date.parse(first.observedAt) >= before && Date.parse(first.observedAt) <= Date.now());
    assert.equal(new Date(first.observedAt).toISOString(), first.observedAt);
    first.raw.fill(255); first.point.height = 99;
    const second = await adapter.getBlockHeader(f.context, { height: 0 });
    assert.equal(Buffer.from(second.raw).toString('hex'), vector.raw);
    assert.equal(second.point.height, 0);
    assert.notEqual(first.raw.buffer, second.raw.buffer);
  }
});

test('header rejects malformed raw framing even when its digest matches the verbose hash', async t => {
  const { createHash } = await import('node:crypto');
  const { genesis, regtestGenesis } = await import('./public-chain-reads-fixtures.mjs');
  const digest = raw => createHash('sha256').update(createHash('sha256').update(Buffer.from(raw, 'hex')).digest()).digest().reverse().toString('hex');
  let raw, verbose;
  const f = await local(t, call => result(call.params[1] ? verbose : raw));
  const modified = (offset, hex, base = genesis.raw) => base.slice(0, offset * 2) + hex + base.slice(offset * 2 + hex.length);
  const noncanonical = regtestGenesis.raw.slice(0, 280) + 'fd2400' + regtestGenesis.raw.slice(282);
  const badRaw = [null, {}, 12, '', '0', 'zz', '0x' + genesis.raw, genesis.raw.toUpperCase(),
    genesis.raw.slice(0, -2), genesis.raw + '00', modified(0, '03000000'), modified(0, '04000080'),
    modified(140, 'fd3f05'), noncanonical, modified(140, 'fe40050000'), modified(140, 'ff4005000000000000'),
    '00'.repeat(2000)];
  for (raw of badRaw) {
    verbose = { ...genesis.verbose, hash: typeof raw === 'string' && /^[0-9a-f]+$/.test(raw) && raw.length % 2 === 0 ? digest(raw) : genesis.verbose.hash };
    await assert.rejects(adapter.getBlockHeader(f.context, { height: 0 }), code('PROTOCOL_MISMATCH'), String(raw).slice(0, 30));
  }
});

test('raw identity, previous hash and timestamp must agree without a genesis exemption', async t => {
  const { genesis, regtestGenesis, blockOne } = await import('./public-chain-reads-fixtures.mjs');
  let raw, verbose;
  const f = await local(t, call => result(call.params[1] ? verbose : raw));
  for (const vector of [genesis, regtestGenesis, blockOne]) {
    for (const changed of [{ hash: hashB }, { previousblockhash: hashB }, { time: vector.verbose.time + 1 },
      { time: -1 }, { time: 4294967296 }]) {
      raw = vector.raw; verbose = { ...vector.verbose, ...changed };
      await assert.rejects(adapter.getBlockHeader(f.context, { height: vector.verbose.height }), code('PROTOCOL_MISMATCH'));
    }
    for (const key of ['hash', 'height', 'previousblockhash', 'time']) {
      raw = vector.raw; verbose = { ...vector.verbose }; delete verbose[key];
      await assert.rejects(adapter.getBlockHeader(f.context, { height: vector.verbose.height }), code('PROTOCOL_MISMATCH'));
    }
    raw = vector.raw.slice(0, -2) + (vector.raw.endsWith('00') ? '01' : '00'); verbose = vector.verbose;
    await assert.rejects(adapter.getBlockHeader(f.context, { height: vector.verbose.height }), code('PROTOCOL_MISMATCH'));
  }
});

test('header rejects malformed verbose shape and signed lossless time tokens', async t => {
  const { genesis } = await import('./public-chain-reads-fixtures.mjs');
  let payload;
  const f = await local(t, call => call.params[1] ? `"result":${payload}` : result(genesis.raw));
  for (const bad of [null, [], 3, 'header', { ...genesis.verbose, previousblockhash: null },
    { ...genesis.verbose, previousblockhash: hashA.toUpperCase() }, { ...genesis.verbose, height: '0' }]) {
    payload = JSON.stringify(bad);
    await assert.rejects(adapter.getBlockHeader(f.context, { height: 0 }), code('PROTOCOL_MISMATCH'));
  }
  for (const token of ['-9223372036854775808', '9223372036854775807', '9007199254740993', '1.5', '1e0', '1.0', '"1"', 'null', '-0']) {
    payload = JSON.stringify(genesis.verbose).replace(/"time":\d+/, `"time":${token}`);
    await assert.rejects(adapter.getBlockHeader(f.context, { height: 0 }), code('PROTOCOL_MISMATCH'), token);
  }
});

test('height zero requires the source genesis parent even for a self-consistent raw hash', async t => {
  const { genesis } = await import('./public-chain-reads-fixtures.mjs');
  const { createHash } = await import('node:crypto');
  const raw = Buffer.from(genesis.raw, 'hex'); raw[4] = 1;
  const hash = createHash('sha256').update(createHash('sha256').update(raw).digest()).digest().reverse().toString('hex');
  const verbose = { ...genesis.verbose, hash, previousblockhash: Buffer.from(raw.subarray(4, 36)).reverse().toString('hex') };
  const f = await local(t, call => result(call.params[1] ? verbose : raw.toString('hex')));
  await assert.rejects(adapter.getBlockHeader(f.context, { height: 0 }), code('PROTOCOL_MISMATCH'));
});

test('abort and timeout cover both header requests through the existing transport', async t => {
  const { genesis } = await import('./public-chain-reads-fixtures.mjs');
  for (const rawStage of [false, true]) {
    let started;
    const arrived = new Promise(resolve => { started = resolve; });
    const f = await local(t, call => {
      if (rawStage && call.params[1]) return result(genesis.verbose);
      started(); return undefined;
    });
    const controller = new AbortController();
    const reading = adapter.getBlockHeader(f.context, { height: 0, signal: controller.signal });
    const rejected = assert.rejects(reading, code('ABORTED'));
    await arrived; controller.abort(); await rejected;
    const timed = { sourceId, transport: http(f.origin + '/rpc', { ...transportOptions, timeoutMs: 30 }) };
    await assert.rejects(adapter.getBlockHeader(timed, { height: 0 }), code('TIMEOUT'));
  }
  const f = await local(t, () => undefined, { timeoutMs: 30 });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(adapter.getTip(f.context, { signal: controller.signal }), code('ABORTED'));
  await assert.rejects(adapter.getBlockHeader(f.context, { height: 0, signal: controller.signal }), code('ABORTED'));
  assert.equal(f.calls.length, 0);
  await assert.rejects(adapter.getTip(f.context), code('TIMEOUT'));
});

test('RPC errors remain errors rather than invented absence and never leak server messages', async t => {
  const { genesis } = await import('./public-chain-reads-fixtures.mjs');
  let rpcCode, stage;
  const f = await local(t, call => {
    if (stage === 'raw' && call.params[1]) return result(genesis.verbose);
    return `"error":{"code":${rpcCode},"message":"block not found secret-fixture","data":"private"}`;
  }, { readRetry: { attempts: 3, delayMs: 0 } });
  for (stage of ['tip', 'verbose', 'raw']) for (rpcCode of [-32601, -5, -8, -1, -28]) {
    const before = f.calls.length;
    const pending = stage === 'tip' ? adapter.getTip(f.context) : adapter.getBlockHeader(f.context, { height: 0 });
    await assert.rejects(pending, error => {
      assert.equal(error.code, rpcCode === -32601 ? 'METHOD_NOT_SUPPORTED' : 'TRANSPORT_ERROR');
      assert.doesNotMatch(String(error), /secret-fixture|not found|private/);
      return true;
    });
    assert.equal(f.calls.length - before, stage === 'raw' ? 2 : 1);
  }
});

test('source label and selector are snapshotted across async HTTP work', async t => {
  const { genesis } = await import('./public-chain-reads-fixtures.mjs');
  let context, args;
  const f = await local(t, call => {
    context.sourceId = 'changed'; args.height = 42;
    return result(call.method === 'getblockchaininfo' ? { blocks: 0, bestblockhash: genesis.verbose.hash }
      : call.params[1] ? genesis.verbose : genesis.raw);
  });
  context = { ...f.context }; args = { height: 0 };
  assert.equal((await adapter.getTip(context)).sourceId, sourceId);
  context = { ...f.context }; args = { height: 0 };
  assert.equal((await adapter.getBlockHeader(context, args)).sourceId, sourceId);
});

test('native crypto failures are sanitized runtime failures', async t => {
  const { genesis } = await import('./public-chain-reads-fixtures.mjs');
  const f = await local(t, call => result(call.params[1] ? genesis.verbose : genesis.raw));
  t.mock.method(crypto.subtle, 'digest', () => Promise.reject(Error('private-native-failure')));
  await assert.rejects(adapter.getBlockHeader(f.context, { height: 0 }), error => {
    assert.equal(error.code, 'RUNTIME_UNAVAILABLE');
    assert.doesNotMatch(String(error), /private-native-failure/); return true;
  });
});

test('caller cancellation during native header hashing rejects the result', async t => {
  const { genesis } = await import('./public-chain-reads-fixtures.mjs');
  const f = await local(t, call => result(call.params[1] ? genesis.verbose : genesis.raw));
  const controller = new AbortController();
  const digest = crypto.subtle.digest.bind(crypto.subtle);
  t.mock.method(crypto.subtle, 'digest', (...args) => { controller.abort(); return digest(...args); });
  await assert.rejects(adapter.getBlockHeader(f.context, { height: 0, signal: controller.signal }), code('ABORTED'));
});

test('internal and root imports have no eager WASM, worker or network activity or new root exports', async () => {
  const { execFileSync } = await import('node:child_process');
  execFileSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    let calls = 0;
    const forbidden = () => { calls++; throw Error('eager activity'); };
    globalThis.fetch = forbidden; globalThis.Worker = forbidden;
    globalThis.WebAssembly = new Proxy(WebAssembly, { get() { return forbidden; } });
    const internal = await import(${JSON.stringify(build + '/src/clients/public-chain-reads.js')});
    const root = await import(${JSON.stringify(build + '/src/index.js')});
    assert.deepEqual(Object.keys(internal).sort(), ['getBlockHeader', 'getTip']);
    for (const name of ['getTip', 'getBlockHeader', 'createPublicClient']) assert.equal(name in root, false);
    assert.equal(calls, 0);
  `], { timeout: 10000 });
});

test('source serialization permits non-4 versions and the full uint32 timestamp/height bounds', async t => {
  const { regtestGenesis } = await import('./public-chain-reads-fixtures.mjs');
  const { createHash } = await import('node:crypto');
  let raw, verbose;
  const f = await local(t, call => result(call.params[1] ? verbose : raw.toString('hex')));
  for (const version of [4, 536870912, 2147483647]) for (const time of [0, 4294967295]) {
    raw = Buffer.from(regtestGenesis.raw, 'hex'); raw.writeUInt32LE(version, 0); raw.writeUInt32LE(time, 100);
    const hash = createHash('sha256').update(createHash('sha256').update(raw).digest()).digest().reverse().toString('hex');
    verbose = { ...regtestGenesis.verbose, hash, time, height: 4294967295 };
    const header = await adapter.getBlockHeader(f.context, { height: 4294967295 });
    assert.equal(header.time, time); assert.equal(header.point.height, 4294967295);
    assert.deepEqual(f.calls.at(-2).params, ['4294967295', true]);
  }
});

// Native Response fixtures exercise admission without requiring localhost sockets.
async function admissionFixture(t) {
  const { genesis } = await import('./public-chain-reads-fixtures.mjs');
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    const call = JSON.parse(init.body); calls.push(call);
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: call.id, result:
      call.method === 'getblockchaininfo' ? { blocks: 0, bestblockhash: genesis.verbose.hash }
        : call.params[1] ? genesis.verbose : genesis.raw }));
  });
  return { calls, source: { sourceId, transport: http('http://127.0.0.1:1/rpc', transportOptions) } };
}

test('admission snapshots each source descriptor once without proxy property rereads', async t => {
  const f = await admissionFixture(t);
  for (const method of [adapter.getTip, adapter.getBlockHeader]) {
    const reads = { sourceId: 0, transport: 0 }; let gets = 0, labelGets = 0;
    const source = new Proxy(f.source, {
      getOwnPropertyDescriptor(target, key) {
        const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
        if (++reads[key] > 1) descriptor.value = { private: 'private-sentinel' };
        return descriptor;
      },
      get(target, key) {
        gets++;
        return key === 'sourceId' && ++labelGets > 2 ? { private: 'private-sentinel' } : Reflect.get(target, key);
      },
    });
    const observation = await method(source, method === adapter.getTip ? {} : { height: 0 });
    assert.equal(observation.sourceId, sourceId);
    assert.deepEqual(reads, { sourceId: 1, transport: 1 });
    assert.equal(gets, 0);
  }
});

test('admission normalizes source and options reflection failures without dispatch', async t => {
  const { isZcashError } = await import(`${build}/src/errors.js`);
  const f = await admissionFixture(t);
  const invalid = error => {
    assert.ok(isZcashError(error));
    assert.equal(error.code, 'INVALID_ARGUMENT');
    assert.equal(error.message, 'Invalid argument.');
    assert.equal(error.cause, undefined);
    assert.doesNotMatch(String(error.stack), /private-sentinel/);
    return true;
  };
  for (const method of [adapter.getTip, adapter.getBlockHeader]) {
    const options = method === adapter.getTip ? { signal: undefined } : { height: 0 };
    for (const location of ['source', 'options']) {
      for (const trap of ['getPrototypeOf', 'ownKeys', 'getOwnPropertyDescriptor', 'revoked']) {
        const target = location === 'source' ? f.source : options;
        let proxy;
        if (trap === 'revoked') {
          const revocable = Proxy.revocable(target, {}); revocable.revoke(); proxy = revocable.proxy;
        } else proxy = new Proxy(target, { [trap]() { throw Error('private-sentinel'); } });
        await assert.rejects(method(location === 'source' ? proxy : f.source,
          location === 'options' ? proxy : options), invalid, `${method.name} ${location} ${trap}`);
      }
    }
    for (const trap of ['getPrototypeOf', 'get', 'revoked']) {
      const target = new AbortController().signal;
      let signal;
      if (trap === 'revoked') {
        const revocable = Proxy.revocable(target, {}); revocable.revoke(); signal = revocable.proxy;
      } else signal = new Proxy(target, { [trap]() { throw Error('private-sentinel'); } });
      await assert.rejects(method(f.source, { ...options, signal }), invalid, `${method.name} signal ${trap}`);
    }
  }
  assert.equal(f.calls.length, 0);
});

test('admission uses data descriptors without invoking throwing source or options get traps', async t => {
  const f = await admissionFixture(t);
  for (const method of [adapter.getTip, adapter.getBlockHeader]) {
    let gets = 0;
    const handler = { get() { gets++; throw Error('private-sentinel'); } };
    const observation = await method(new Proxy(f.source, handler),
      new Proxy(method === adapter.getTip ? {} : { height: 0 }, handler));
    assert.equal(observation.sourceId, sourceId);
    assert.equal(gets, 0);
  }
});
