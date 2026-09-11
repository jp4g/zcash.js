import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, open, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import vm from 'node:vm';
import { build } from 'vite';

// File descriptors also work in sandboxes that deny socket-backed child pipes.
async function exec(command, args, options = {}) {
  const folder = await mkdtemp(join(tmpdir(), 'zcash-sdk-command-'));
  const stdout = await open(join(folder, 'stdout'), 'w+');
  const stderr = await open(join(folder, 'stderr'), 'w+');
  try {
    const code = await new Promise((resolve, reject) => {
      const child = spawn(command, args, { ...options, stdio: ['ignore', stdout.fd, stderr.fd] });
      child.once('error', reject);
      child.once('close', resolve);
    });
    const output = { stdout: await readFile(join(folder, 'stdout'), 'utf8'), stderr: await readFile(join(folder, 'stderr'), 'utf8') };
    assert.equal(code, 0, `${command} ${args.join(' ')}\n${output.stdout}\n${output.stderr}`);
    return output;
  } finally {
    await stdout.close();
    await stderr.close();
    await rm(folder, { recursive: true, force: true });
  }
}
const implemented = ['accountIndex', 'blockHash', 'diversifierIndex', 'formatZec', 'http', 'isZcashError', 'parseZec', 'txId'];

test('packed private package imports and typechecks in an isolated Node consumer', async (t) => {
  const folder = await mkdtemp(join(tmpdir(), 'zcash-sdk-consumer-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const { stdout } = await exec('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', folder]);
  const [packed] = JSON.parse(stdout);
  assert.ok(packed.files.some(file => file.path === 'dist/src/index.js'));
  assert.ok(packed.files.some(file => file.path === 'dist/docs/api/public-api.d.ts'));
  assert.ok(packed.files.every(file => !file.path.startsWith('qualification/')));
  const consumer = join(folder, 'consumer');
  await mkdir(consumer);
  await writeFile(join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  await exec('npm', ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', join(folder, packed.filename)], { cwd: consumer });
  const manifest = JSON.parse(await readFile(join(consumer, 'node_modules/zcash.js/package.json'), 'utf8'));
  assert.equal(manifest.private, true);
  assert.equal(manifest.dependencies, undefined);
  const runtime = await exec(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    Object.defineProperty(globalThis, 'WebAssembly', { get() { throw Error('WASM forbidden'); } });
    globalThis.fetch = () => { throw Error('Import/construction must be lazy'); };
    const sdk = await import('zcash.js');
    assert.equal(sdk.parseZec('9007199254740993.00000001'), 900719925474099300000001n);
    sdk.http('https://synthetic.invalid', { sourceId: 'fixture', timeoutMs: 10, readRetry: { attempts: 1, delayMs: 0 }, maxResponseBytes: 256 });
    await assert.rejects(import('zcash.js/dist/src/http.js'), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
    console.log(JSON.stringify(Object.keys(sdk).sort()));
  `], { cwd: consumer });
  assert.deepEqual(JSON.parse(runtime.stdout), implemented);
  await writeFile(join(consumer, 'consumer.ts'), `
    import { parseZec, formatZec, txId, blockHash, accountIndex, diversifierIndex, http, isZcashError } from 'zcash.js';
    import type { TxId, BlockHash, AccountIndex, DiversifierIndex, HttpTransport, ZcashError } from 'zcash.js';
    const amount: bigint = parseZec('1.234');
    const text: string = formatZec(amount);
    const tx: TxId = txId('a'.repeat(64));
    const hash: BlockHash = blockHash('b'.repeat(64));
    const account: AccountIndex = accountIndex(0);
    const index: DiversifierIndex = diversifierIndex(0n);
    const transport: HttpTransport = http('https://synthetic.invalid', {
      sourceId: 'test', timeoutMs: 1000, readRetry: { attempts: 1, delayMs: 0 }, maxResponseBytes: 4096,
    });
    const caught: unknown = null;
    if (isZcashError(caught)) { const error: ZcashError = caught; error.paymentState?.steps; error.syncStatus?.scan; }
    // @ts-expect-error Frozen but unimplemented factories are absent from the SDK.
    import { createWalletClient, createPublicClient, defineNetwork } from 'zcash.js';
    // @ts-expect-error Transport has no public raw-request escape hatch.
    transport.request('getblockchaininfo');
    // @ts-expect-error No implicit number-to-bigint coercion.
    formatZec(1);
    // @ts-expect-error Display hashes have separate brands.
    const wrong: TxId = hash;
  `);
  await writeFile(join(consumer, 'tsconfig.json'), JSON.stringify({ compilerOptions: {
    target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', lib: ['ES2022', 'DOM'],
    strict: true, noEmit: true, types: [], exactOptionalPropertyTypes: true,
  }, include: ['consumer.ts'] }));
  await exec(process.execPath, [resolve('node_modules/typescript/bin/tsc'), '-p', join(consumer, 'tsconfig.json')]);
  // The same actual installed declarations must resolve for browser bundlers.
  await exec(process.execPath, [resolve('node_modules/typescript/bin/tsc'), '-p', join(consumer, 'tsconfig.json'), '--module', 'ESNext', '--moduleResolution', 'Bundler']);
});

test('browser bundle imports and executes reads without Node globals or WASM', async () => {
  const result = await build({ configFile: false, logLevel: 'silent', build: {
    write: false, minify: false, target: 'es2022',
    lib: { entry: resolve('tests/sdk/browser-entry.mjs'), name: 'SDKProbe', formats: ['iife'] },
  } });
  const outputs = (Array.isArray(result) ? result : [result]).flatMap(item => item.output);
  assert.equal(outputs.length, 1);
  const code = outputs[0].code;
  assert.doesNotMatch(code, /node:|__vite-browser-external|WebAssembly|require\(/);
  let calls = 0;
  const globals = { URL, Headers, Response, ReadableStream, TextEncoder, TextDecoder,
    AbortController, AbortSignal, performance, setTimeout, clearTimeout,
    fetch: async (_url, init) => {
      calls++;
      assert.equal(init.credentials, 'omit');
      const { id } = JSON.parse(init.body);
      return new Response(`{"jsonrpc":"2.0","id":${JSON.stringify(id)},"result":{"value":9007199254740993}}`);
    },
  };
  Object.defineProperty(globals, 'WebAssembly', { get() { throw Error('WASM forbidden'); } });
  const context = vm.createContext(globals, { codeGeneration: { strings: false, wasm: false } });
  vm.runInContext(code, context);
  assert.equal(calls, 0);
  const observed = await context.SDKProbe.run();
  assert.equal(observed.amount, '9007199254740993.00000001');
  assert.equal(observed.value, '9007199254740993');
  assert.equal(observed.errorCode, 'INVALID_ARGUMENT');
  assert.deepEqual([...observed.exports], implemented);
  assert.equal(calls, 1);
});
