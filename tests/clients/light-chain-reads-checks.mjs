import { revision, hash, nextHash, tipBytes, display, blockBytes, bytesField, scalar, concat } from './light-chain-reads-fixtures.mjs';

// Identical real HTTP checks run in Node and in an ordinary Firefox page's own module realm.
export async function chainChecks(codec, internal, createGrpcWebByteTransport, origin, golden) {
  let assertions = 0, requests = 0;
  const equal = (actual, expected) => {
    assertions++; if (JSON.stringify(actual) !== JSON.stringify(expected)) throw Error('fixture assertion failed');
  };
  const rejects = async (action, code) => {
    try { await action(); } catch (error) {
      equal(error.code, code); equal(error.name, 'ZcashError');
      equal(/private-secret|\?case=/.test(String(error) + JSON.stringify(error)), false); return;
    }
    throw Error('Expected rejection: ' + code);
  };
  const transport = (mode = 'good', timeoutMs = 2000) => ({ kind: 'custom-lightwallet', sourceId: 'fixture', protocolRevision: revision,
    ...createGrpcWebByteTransport(origin + '?case=' + mode, { timeoutMs }) });
  const tip = mode => { requests++; return internal.getTip(codec, transport(mode)); };
  const range = { fromHeight: 7, toHeight: 8 };
  const stream = (mode, signal, timeoutMs) => {
    requests++; return internal.streamCompactBlocks(codec, transport(mode, timeoutMs), { ...range, ...(signal ? { signal } : {}) });
  };
  const collect = async iterator => { const values = []; for await (const value of iterator) values.push(value); return values; };
  const result = await tip('good');
  equal(result.height, 7); equal(result.hash, display(hash)); equal(result.sourceId, 'fixture');
  equal(new Date(result.observedAt).toISOString(), result.observedAt);
  for (const mode of ['overflow32', 'overflow53', 'default', 'malformed', 'short-hash']) await rejects(() => tip(mode), 'PROTOCOL_MISMATCH');
  await rejects(() => tip('error'), 'TRANSPORT_ERROR');
  for (const mode of ['good', 'fragmented', 'owned']) {
    const blocks = await collect(stream(mode)); equal(blocks.length, 2);
    equal(blocks.map(b => b.point), [{ height: 7, hash: display(hash) }, { height: 8, hash: display(nextHash) }]);
    equal(blocks[1].previousHash, blocks[0].point.hash);
    const extra = mode === 'owned' ? concat(bytesField(8, scalar(3, 19)), bytesField(99, new Uint8Array([1, 2, 3]))) : new Uint8Array();
    equal([...blocks[0].encoded], [...blockBytes(7, hash, nextHash, extra)]);
    blocks[0].encoded.fill(255); equal([...blocks[1].encoded], [...blockBytes(8, nextHash, hash)]);
  }
  for (const mode of ['overflow32', 'overflow53', 'default', 'malformed', 'short-hash', 'short-prev', 'partial', 'empty', 'order', 'link', 'extra']) {
    await rejects(() => collect(stream(mode)), 'PROTOCOL_MISMATCH');
  }
  for (const mode of ['missing', 'error']) {
    const iterator = stream(mode);
    equal((await iterator.next()).value.point.height, 7); equal((await iterator.next()).value.point.height, 8);
    await rejects(() => iterator.next(), mode === 'missing' ? 'PROTOCOL_MISMATCH' : 'TRANSPORT_ERROR');
  }
  const vector = golden.find(v => v.method === 'GetBlockRange' && v.direction === 'item');
  equal(vector.dto.vtx[0].ironwood_actions.length > 0, true);
  const original = concat(Uint8Array.from(vector.hex.match(/../g), h => parseInt(h, 16)), scalar(2, 7), bytesField(99, new Uint8Array([42])));
  const goldenBlocks = await collect(stream('golden')); equal([...goldenBlocks[0].encoded], [...original]);
  const controller = new AbortController();
  controller.signal.addEventListener('abort', event => event.stopImmediatePropagation());
  const cancelled = stream('stall', controller.signal);
  equal((await cancelled.next()).value.point.height, 7);
  controller.signal.dispatchEvent(new Event('abort'));
  const pending = cancelled.next(); controller.abort('private-secret');
  await rejects(() => pending, 'ABORTED');
  const returned = stream('stall'); await returned.next();
  const blocked = returned.next(); await returned.return(); await rejects(() => blocked, 'ABORTED');
  const early = stream('stall'); for await (const block of early) { equal(block.point.height, 7); break; }
  await rejects(() => collect(stream('stall', undefined, 60)), 'TIMEOUT');
  const pre = new AbortController(); pre.abort();
  await rejects(() => internal.getTip(codec, transport(), { signal: pre.signal }), 'ABORTED');
  await rejects(() => internal.getTip(codec, { ...transport(), protocolRevision: 'v0.5.0' }), 'PROTOCOL_MISMATCH');
  await rejects(() => collect(internal.streamCompactBlocks(codec, transport(), { fromHeight: 8, toHeight: 7 })), 'INVALID_ARGUMENT');
  // Custom final-boundary controls still use the authentic codec, in the page's realm.
  const late = new AbortController();
  const custom = { ...transport(), unary() {
    const bytes = tipBytes();
    queueMicrotask(() => late.abort()); return Promise.resolve(bytes);
  } };
  await rejects(() => internal.getTip(codec, custom, { signal: late.signal }), 'ABORTED');
  const last = new AbortController(); let released = 0;
  const customStream = { ...transport(), stream() { return { [Symbol.asyncIterator]() { return this; }, next() {
    queueMicrotask(() => last.abort()); return Promise.resolve({ done: false, value: blockBytes() });
  }, async return() { released++; return { done: true }; } }; } };
  await rejects(() => internal.streamCompactBlocks(codec, customStream, { ...range, signal: last.signal }).next(), 'ABORTED');
  equal(released, 1);
  for (const site of ['unary', 'stream', 'asyncIterator', 'next']) {
    for (const actualAbort of [false, true]) {
        const controller = new AbortController();
        let reads = 0, calls = 0, pulls = 0, releases = 0;
        const iterator = { [Symbol.asyncIterator]() { return this; },
          next() { pulls++; return { done: false, value: blockBytes() }; },
          return() { equal(this === iterator, true); releases++; return { done: true }; } };
        const custom = { ...transport(), unary() { return tipBytes(); }, stream() { return iterator; } };
        const receiver = site === 'unary' || site === 'stream' ? custom : iterator;
        const key = site === 'asyncIterator' ? Symbol.asyncIterator : site;
        const original = receiver[key];
        function method(...args) { equal(this === receiver, true); calls++; return Reflect.apply(original, this, args); }
        Object.defineProperty(method, 'call', { get() { reads++; controller.abort(); return Function.prototype.call; } });
        Object.defineProperty(receiver, key, { get() { if (actualAbort) controller.abort(); return method; } });
        const stream = site === 'unary' ? undefined : internal.streamCompactBlocks(codec, custom,
          { fromHeight: 7, toHeight: 7, signal: controller.signal });
        const result = site === 'unary' ? internal.getTip(codec, custom, { signal: controller.signal }) : stream.next();
        try {
          if (actualAbort) await rejects(() => result, 'ABORTED');
          else {
            const value = await result;
            equal(site === 'unary' ? value.height : value.value.point.height, 7);
            if (stream) equal(value.done, false);
            equal(controller.signal.aborted, false);
          }
        } finally { await stream?.return(); }
        equal(reads, 0); equal(calls, actualAbort ? 0 : 1);
        equal(pulls, site === 'unary' || actualAbort ? 0 : 1);
        equal(releases, site === 'unary' || (site === 'stream' && actualAbort) ? 0 : 1);
    }
  }
  const network = Object.freeze({ identity: 'synthetic-regtest', genesisHash: display(hash) });
  const tree = (mode, signal) => { requests++; return internal.getTreeState(codec, transport(mode), network, 'regtest', { height: 7, ...(signal ? { signal } : {}) }); };
  const state = await tree('tree-good');
  equal(state.point, { height: 7, hash: display(hash) }); equal(state.network, network);
  equal([...state.sapling], [0, 0, 0]); equal(state.ironwood, null);
  equal(codec.decodeResponse('GetTreeState', state.encoded).hash, state.point.hash);
  await rejects(() => tree('tree-network'), 'NETWORK_MISMATCH');
  await rejects(() => tree('tree-height'), 'PROTOCOL_MISMATCH');
  const cancellation = new AbortController();
  const stalledTree = tree('tree-stall', cancellation.signal);
  setTimeout(() => cancellation.abort(), 50);
  await rejects(() => stalledTree, 'ABORTED');
  return { ok: true, assertions, requests };
}
