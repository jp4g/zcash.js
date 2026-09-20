// Release-engine build: explicit source/tool locations, locked dependencies, no private paths.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFileSync, cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';

const revision = '83b4693a83722d534d98cc5c7a7532e38a54a4db';
const bindgenSha256 = 'dc9e4f1e03996c26fb8bfedfded73d81120a37251c3f19eb87bb460f1f89a5be';
assert.equal(process.argv.length, 6, 'usage: node scripts/build-native-wallet.mjs SOURCE WASI_SDK WASM_BINDGEN NEW_OUTPUT');
const [source, sdk, bindgen, output] = process.argv.slice(2).map(value => resolve(value));
const cargoHome = resolve(process.env.CARGO_HOME ?? join(homedir(), '.cargo'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const git = (...args) => execFileSync('git', ['-C', source, ...args], { encoding: 'utf8' }).trim();
assert.equal(git('rev-parse', 'HEAD'), revision, 'pinned native revision');
assert.equal(git('diff', 'HEAD', '--'), '', 'native tracked sources must be clean');
assert.equal(sha(readFileSync(bindgen)), bindgenSha256, 'pinned wasm-bindgen executable');
assert.equal(execFileSync(bindgen, ['--version'], { encoding: 'utf8' }).trim(), 'wasm-bindgen 0.2.128');
assert.equal(sha(readFileSync(join(sdk, 'bin/clang'))), 'e78c818b321d834a20df5796afa9a9329dc53fd1f0a2597166c7a283b355be77', 'pinned WASI compiler');
assert.equal(sha(readFileSync(join(sdk, 'share/wasi-sysroot/lib/wasm32-wasi/libc.a'))), '8e79a8b06402c7a8e93bbed56a17b4827c81e29451f73c3f47669a7ea7494006', 'pinned WASI libc');
assert.equal(execFileSync('rustc', ['--version'], { encoding: 'utf8' }).trim(), 'rustc 1.98.1 (48a229cea 2026-09-01)', 'pinned Rust compiler');
mkdirSync(output); // Exclusive destination; never overwrite an existing build.
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  !/^(RUSTFLAGS|CARGO_ENCODED_RUSTFLAGS|CARGO_TARGET_DIR|CARGO_BUILD_RUSTFLAGS|CC|CXX|AR|LD|RANLIB|CFLAGS|LIBSQLITE|WALLET_)/.test(key)));
Object.assign(env, { CARGO_TARGET_DIR: join(output, 'target'), CARGO_BUILD_JOBS: '2' });
const run = (command, args, options = {}) => execFileSync(command, args, { cwd: source, env, stdio: 'inherit', maxBuffer: 32 * 1024 * 1024, ...options });
const metadata = JSON.parse(run('cargo', ['metadata', '--locked', '--offline', '--features', 'wallet-storage', '--format-version', '1'], { encoding: 'utf8', stdio: 'pipe' }));
const verifiedPackages = JSON.parse(run('python3', [join(import.meta.dirname, 'verify-native-inputs.py'), source, output], {
  encoding: 'utf8', stdio: 'pipe', input: JSON.stringify(metadata),
}));
const sqlite = metadata.packages.find(pkg => pkg.name === 'libsqlite3-sys');
assert.ok(sqlite, 'locked SQLite dependency');
Object.assign(env, {
  WALLET_SDK: sdk,
  WALLET_SQLITE: join(sqlite.manifest_path, '..', 'sqlite3'),
  CC_wasm32_unknown_unknown: join(sdk, 'bin/clang'),
  AR_wasm32_unknown_unknown: join(sdk, 'bin/llvm-ar'),
  CFLAGS_wasm32_unknown_unknown: `--target=wasm32-wasi --sysroot=${sdk}/share/wasi-sysroot -DSQLITE_OS_OTHER=1 -USQLITE_THREADSAFE -DSQLITE_THREADSAFE=0 -DSQLITE_TEMP_STORE=3 -DSQLITE_OMIT_LOAD_EXTENSION=1`,
  LIBSQLITE3_FLAGS: '-DSQLITE_ENABLE_MEMSYS5 -DSQLITE_ZERO_MALLOC -DLONGDOUBLE_TYPE=double -DSQLITE_OMIT_WAL',
  RUSTFLAGS: `--remap-path-prefix=${source}=/source --remap-path-prefix=${cargoHome}=/cargo -C link-arg=--max-memory=268435456`,
});
run('cargo', ['build', '--locked', '--offline', '--release', '--target', 'wasm32-unknown-unknown', '--features', 'wallet-storage', '--lib']);
const bundle = join(output, 'bundle');
run(bindgen, ['--target', 'web', '--keep-lld-exports', '--out-dir', bundle, '--out-name', 'bindings', join(output, 'target/wasm32-unknown-unknown/release/zakura_network_bindings.wasm')]);
for (const name of ['bytes.mjs', 'wallet.mjs', 'views.mjs', 'network.mjs', 'transaction.mjs']) copyFileSync(join(source, name), join(bundle, name));
cpSync(join(source, 'wallet-host'), join(bundle, 'wallet-host'), { recursive: true });
const inspection = run('node', ['tests/wallet-inspect.mjs', bundle], { encoding: 'utf8', stdio: 'pipe' });
assert.equal(JSON.parse(inspection).pass, true);
const inventory = directory => Object.fromEntries(readdirSync(directory, { recursive: true, withFileTypes: true })
  .filter(entry => entry.isFile()).map(entry => {
    const path = join(entry.parentPath, entry.name);
    return [path.slice(directory.length + 1), sha(readFileSync(path))];
  }).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(join(output, 'build.json'), JSON.stringify({
  format: 'zcash-js-native-build/1', revision, tree: git('rev-parse', 'HEAD^{tree}'),
  lockSha256: sha(readFileSync(join(source, 'Cargo.lock'))),
  nativePolicy: JSON.parse(readFileSync(join(source, 'native-policy/vendor/receipt.json'))),
  packages: verifiedPackages,
  rustc: run('rustc', ['-Vv'], { encoding: 'utf8', stdio: 'pipe' }),
  producerSha256: sha(readFileSync(import.meta.filename)),
  environment: Object.fromEntries(Object.entries(env).filter(([key]) => /^(RUSTFLAGS|CARGO_BUILD_JOBS|CC_|AR_|CFLAGS_|LIBSQLITE|WALLET_)/.test(key))),
  bindgenSha256, sdkClangSha256: sha(readFileSync(join(sdk, 'bin/clang'))),
  inspection: JSON.parse(inspection), artifacts: inventory(bundle),
}, null, 2) + '\n', { flag: 'wx' });
console.log(`Built native wallet: ${output}`);
