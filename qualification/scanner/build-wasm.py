#!/usr/bin/env python3
"""Consume the frozen F1 adapter read-only, using independent scanner build output."""
import hashlib
import json
import os
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parent
SDK = Path('/home/jack/zcash-qualification-scratch/wasi-sdk-27.0-x86_64-linux')
ADAPTER = Path('/home/jack/zcash-generated-runtime-scratch/build-1789135187453484355/sources/adapter.c')
HOST = Path('/home/jack/zcash-generated-runtime-scratch/execution-2/web/runtime-host.mjs')
EXPECTED = ['806f2da21227408e7b4b046b6ac4d15cad7a3f38ea61b60b4d2bc4e46ac5e475', 'd59678cb60baeff5ce94a729ae30d37aca1e0315559953e9d3ccc28a55bbc8c7']
for path, expected in [(ADAPTER, EXPECTED[0]), (HOST, EXPECTED[1])]:
    assert hashlib.sha256(path.read_bytes()).hexdigest() == expected, f'F1 input drift: {path}'
Path('/home/jack/zcash-scanner-logs/f1-inputs.json').write_text(json.dumps({str(ADAPTER): EXPECTED[0], str(HOST): EXPECTED[1]}, indent=2)+'\n')
env = dict(os.environ)
env.update(SCANNER_SDK=str(SDK), SCANNER_ADAPTER=str(ADAPTER),
    SCANNER_SQLITE=str(Path(env['CARGO_HOME'])/'registry/src/index.crates.io-1949cf8c6b5b557f/libsqlite3-sys-0.35.0/sqlite3'),
    CC_wasm32_unknown_unknown=str(SDK/'bin/clang'), AR_wasm32_unknown_unknown=str(SDK/'bin/llvm-ar'),
    CFLAGS_wasm32_unknown_unknown=f'--target=wasm32-wasi --sysroot={SDK}/share/wasi-sysroot -DSQLITE_OS_OTHER=1 -USQLITE_THREADSAFE -DSQLITE_THREADSAFE=0 -DSQLITE_TEMP_STORE=3 -DSQLITE_OMIT_LOAD_EXTENSION=1',
    LIBSQLITE3_FLAGS='-DSQLITE_ENABLE_MEMSYS5 -DSQLITE_ZERO_MALLOC -DLONGDOUBLE_TYPE=double')
subprocess.run(['cargo', 'build', '--offline', '--locked', '--lib', '--target', 'wasm32-unknown-unknown', '--no-default-features', '--features', 'wasm-replay'], env=env, cwd=ROOT, check=True)
output = Path('/home/jack/zcash-scanner-scratch/replay-web')
output.mkdir(exist_ok=True)
subprocess.run(['/home/jack/zcash-node-runtime-scratch/wasm-bindgen-0.2.128-x86_64-unknown-linux-musl/wasm-bindgen',
    str(Path(env['CARGO_TARGET_DIR'])/'wasm32-unknown-unknown/debug/issue_2_scanner.wasm'), '--target', 'web', '--keep-lld-exports', '--out-dir', str(output), '--out-name', 'scanner'], check=True)
(output/'runtime-host.mjs').write_bytes(HOST.read_bytes())
(output/'package.json').write_text('{"type":"module"}\n')
for name in ['worker.mjs', 'node.mjs', 'browser.html', 'browser-worker.mjs']:
    if (ROOT/'replay'/name).exists(): (output/name).write_bytes((ROOT/'replay'/name).read_bytes())
Path('/home/jack/zcash-scanner-logs/wasm-artifacts.json').write_text(json.dumps({str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in output.rglob('*') if p.is_file()}, indent=2)+'\n')
