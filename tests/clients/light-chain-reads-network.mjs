import { buildRoot as build, outputRoot } from '../support/paths.mjs';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { fixtureCodec, serveChainFixtures, base64, frame, service } from './light-chain-reads-fixtures.mjs';
import { chainChecks } from './light-chain-reads-checks.mjs';
const logs = process.env.LIGHT_CHAIN_LOGS ?? outputRoot + '/light-chain-network/logs';
mkdirSync(logs, { recursive: true });
const receipt = mkdtempSync(logs + '/node-network-') + '/receipt.json';
const report = { ok: false, node: process.versions.node, started: new Date().toISOString(), receipt };
const save = () => writeFileSync(receipt, JSON.stringify(report, null, 2) + '\n');
const stop = new AbortController(); let fixture;
const onSignal = () => stop.abort(Error('interrupted'));
process.on('SIGINT', onSignal); process.on('SIGTERM', onSignal);
const deadline = setTimeout(() => stop.abort(Error('fixture deadline')), 30000);
save();
try {
  const accepted = await fixtureCodec(); report.codec = accepted.provenance;
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  report.sources = {};
  for (const path of ['src/clients/light-chain-reads.ts', 'src/clients/grpc-web.ts', 'src/errors.ts', 'src/primitives.ts', 'tsconfig.json',
    'tests/clients/light-chain-reads-network.mjs', 'tests/clients/light-chain-reads-fixtures.mjs', 'tests/clients/light-chain-reads-checks.mjs']) {
    report.sources[path] = hash(readFileSync(new URL('../../' + path, import.meta.url)));
  }
  report.compiled = {};
  for (const path of ['src/clients/light-chain-reads.js', 'src/clients/grpc-web.js', 'src/errors.js', 'src/primitives.js']) {
    report.compiled[path] = hash(readFileSync(build + '/' + path));
  }
  save();
  await serveChainFixtures(new Map(), { signal: stop.signal, golden: accepted.golden, onCreate: owned => { fixture = owned; } });
  const internal = await import(build + '/src/clients/light-chain-reads.js');
  const { createGrpcWebByteTransport } = await import(build + '/src/clients/grpc-web.js');
  report.result = await chainChecks(accepted.codec, internal, createGrpcWebByteTransport, fixture.origin, accepted.golden);
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(fixture.requests.length, report.result.requests);
  for (const request of fixture.requests) {
    assert.equal(request.body, request.path === service + 'GetLatestBlock' ? 'AAAAAAA='
      : base64(frame(new Uint8Array([10, 2, 8, 7, 18, 2, 8, 8]))));
    assert.ok(!request.headers.cookie && !request.headers.referer);
  }
  assert.equal(fixture.closed.filter(mode => mode === 'stall').length, 4);
  report.ok = true;
} catch (error) { report.error = String(error); }
finally {
  clearTimeout(deadline); stop.abort();
  try { await fixture?.close(); report.serverClosed = true; } catch (error) { report.cleanupError = String(error); report.ok = false; }
  process.off('SIGINT', onSignal); process.off('SIGTERM', onSignal);
  report.signalListenersRemoved = true;
  report.requests = fixture?.requests.map(({ path, mode, body }) => ({ path, mode, body })) ?? [];
  report.finished = new Date().toISOString(); save(); console.log(JSON.stringify(report, null, 2));
}
if (!report.ok) process.exitCode = 1;
