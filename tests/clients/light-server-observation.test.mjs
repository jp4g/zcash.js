import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { acceptedArtifacts, fixtureFetch, serveObservationFixtures } from './light-server-observation-fixtures.mjs';
import { observationChecks } from './light-server-observation-checks.mjs';
const build = process.env.LIGHT_OBSERVATION_BUILD ?? '/home/jack/zcash-light-server-observation-scratch/build';
const { readLightdInfo } = await import(pathToFileURL(build + '/src/clients/light-server-observation.js'));
const { createGrpcWebByteTransport } = await import(pathToFileURL(build + '/src/clients/grpc-web.js'));
const packet = await acceptedArtifacts();
const codecRoot = '/home/jack/zcash-light-server-observation-scratch/codec';
await mkdir(codecRoot + '/wasm', { recursive: true });
await writeFile(codecRoot + '/package.json', '{"type":"module"}\n');
for (const [path, data] of packet.assets) await writeFile(codecRoot + '/' + path, data);
const { createLightwire } = await import(pathToFileURL(codecRoot + '/codec.mjs'));
const codec = createLightwire(await readFile(codecRoot + '/wasm/zakura_lightwire_bg.wasm'));
test('actual accepted Rust codec + byte transport + observation assertions', async () => {
  const original = globalThis.fetch;
  const requests = [];
  let fixture;
  try {
    if (process.env.LIGHT_OBSERVATION_HTTP === '1') fixture = await serveObservationFixtures(new Map(), { onCreate: value => { fixture = value; } });
    else globalThis.fetch = fixtureFetch(requests);
    const result = await observationChecks({ readLightdInfo, createGrpcWebByteTransport, codec, origin: fixture?.origin ?? 'http://fixture.invalid' });
    const received = fixture?.requests ?? requests;
    assert.equal(received.length, 37);
    assert.ok(received.every(r => r.path === '/cash.z.wallet.sdk.rpc.CompactTxStreamer/GetLightdInfo' && r.method === 'POST' && r.body === 'AAAAAAA='));
    console.log(JSON.stringify({ ...result, node: process.version, requests: received.length, sockets: !!fixture, codec: packet.provenance }));
  } finally { globalThis.fetch = original; await fixture?.close(); }
});
