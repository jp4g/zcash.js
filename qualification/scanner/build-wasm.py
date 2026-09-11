#!/usr/bin/env python3
"""Build from a fresh source snapshot; never overwrite a prior executable bundle."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import time

ROOT = Path(__file__).resolve().parent
SCRATCH = Path('/home/jack/zcash-scanner-scratch')
LOGS = Path('/home/jack/zcash-scanner-logs')
SDK = Path('/home/jack/zcash-qualification-scratch/wasi-sdk-27.0-x86_64-linux')
ADAPTER = Path('/home/jack/zcash-generated-runtime-scratch/build-1789135187453484355/sources/adapter.c')
HOST = Path('/home/jack/zcash-generated-runtime-scratch/execution-2/web/runtime-host.mjs')
BINDGEN = Path('/home/jack/zcash-node-runtime-scratch/wasm-bindgen-0.2.128-x86_64-unknown-linux-musl/wasm-bindgen')
EXPECTED = ['806f2da21227408e7b4b046b6ac4d15cad7a3f38ea61b60b4d2bc4e46ac5e475', 'd59678cb60baeff5ce94a729ae30d37aca1e0315559953e9d3ccc28a55bbc8c7']

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def inventory(root):
    return {str(p.relative_to(root)): {'sha256': sha(p), 'bytes': p.stat().st_size}
            for p in sorted(root.rglob('*')) if p.is_file() and '__pycache__' not in p.parts}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--stage', default=f'extension-{time.time_ns()}')
    args = parser.parse_args()
    if not re.fullmatch(r'[a-zA-Z0-9_-]+', args.stage):
        raise ValueError('Invalid bundle stage')
    measured = {}
    for path, expected in [(ADAPTER, EXPECTED[0]), (HOST, EXPECTED[1])]:
        measured[str(path)] = sha(path)
        if measured[str(path)] != expected:
            raise ValueError(f'F1 input drift: {path}')
    bundle = SCRATCH / 'bundles' / args.stage
    evidence = LOGS / 'bundles' / args.stage
    bundle.mkdir(parents=True, exist_ok=False)
    evidence.mkdir(parents=True, exist_ok=False)
    source = bundle / 'sources'
    source.mkdir()
    inputs = inventory(ROOT)
    for name in inputs:
        dest = source / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / name, dest)
    if inventory(source) != inputs:
        raise ValueError('source snapshot drift')
    # The exact external adapter is copied into this owned immutable build input.
    adapter = bundle / 'adapter.c'
    shutil.copyfile(ADAPTER, adapter)
    if sha(adapter) != measured[str(ADAPTER)]:
        raise ValueError('adapter input drift during copy')
    host = bundle / 'runtime-host.mjs'
    shutil.copyfile(HOST, host)
    if sha(host) != measured[str(HOST)]:
        raise ValueError('host input drift during copy')
    env = dict(os.environ)
    env.update(SCANNER_SDK=str(SDK), SCANNER_ADAPTER=str(adapter),
        SCANNER_SQLITE=str(Path(env['CARGO_HOME'])/'registry/src/index.crates.io-1949cf8c6b5b557f/libsqlite3-sys-0.35.0/sqlite3'),
        CC_wasm32_unknown_unknown=str(SDK/'bin/clang'), AR_wasm32_unknown_unknown=str(SDK/'bin/llvm-ar'),
        CFLAGS_wasm32_unknown_unknown=f'--target=wasm32-wasi --sysroot={SDK}/share/wasi-sysroot -DSQLITE_OS_OTHER=1 -USQLITE_THREADSAFE -DSQLITE_THREADSAFE=0 -DSQLITE_TEMP_STORE=3 -DSQLITE_OMIT_LOAD_EXTENSION=1',
        LIBSQLITE3_FLAGS='-DSQLITE_ENABLE_MEMSYS5 -DSQLITE_ZERO_MALLOC -DLONGDOUBLE_TYPE=double')
    commands = []
    def run(label, argv):
        log = evidence / f'{label}.log'
        with log.open('xb') as out:
            result = subprocess.run(argv, cwd=source, env=env, stdout=out, stderr=subprocess.STDOUT)
        commands.append({'argv':argv, 'cwd':str(source), 'exit':result.returncode, 'log':str(log), 'output_sha256':sha(log)})
        print(json.dumps(commands[-1]), flush=True)
        if result.returncode:
            print(log.read_text()[-6000:])
            raise RuntimeError(f'{label} failed')
    provenance = {'format':'scanner-bundle-v2','stage':args.stage,
        'git_head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),
        'sources':inputs,'f1_inputs':measured,
        'bindgen':{'path':str(BINDGEN),'sha256':sha(BINDGEN)},
        'environment':{k:env.get(k) for k in ['SCANNER_SDK','SCANNER_ADAPTER','SCANNER_SQLITE','CARGO_HOME','CARGO_TARGET_DIR','CARGO_BUILD_JOBS','RAYON_NUM_THREADS','RUSTFLAGS','CARGO_ENCODED_RUSTFLAGS','CFLAGS_wasm32_unknown_unknown','CC_wasm32_unknown_unknown','AR_wasm32_unknown_unknown','LIBSQLITE3_FLAGS']},
        'commands':commands,'complete':False}
    try:
        run('build',['cargo','build','--offline','--locked','--lib','--target','wasm32-unknown-unknown','--no-default-features','--features','wasm-replay'])
        raw = bundle / 'scanner.raw.wasm'
        shutil.copyfile(Path(env['CARGO_TARGET_DIR'])/'wasm32-unknown-unknown/debug/issue_2_scanner.wasm',raw)
        web = bundle / 'web'; web.mkdir()
        run('bindgen',[str(BINDGEN),str(raw),'--target','web','--keep-lld-exports','--out-dir',str(web),'--out-name','scanner'])
        shutil.copyfile(host,web/'runtime-host.mjs')
        (web/'package.json').write_text('{"type":"module"}\n')
        for path in (source/'replay').iterdir():
            if path.suffix in ['.mjs','.html'] and not path.name.startswith('test-'):
                shutil.copyfile(path,web/path.name)
        shutil.copytree(source/'references',web/'references')
        manifest = {'format':'scanner-bundle-v2','stage':args.stage,
            'source_inventory_sha256':hashlib.sha256(json.dumps(inputs,sort_keys=True).encode()).hexdigest(),
            'raw_sha256':sha(raw),'cases':['transparent','effects-trees','imported-batches','failures','rollback','rewind'],
            'files':inventory(web)}
        (web/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
        if inventory(source) != inputs:
            raise ValueError('build mutated source snapshot')
        pointer = {'bundle':str(bundle),'web':str(web),'manifest_sha256':sha(web/'manifest.json'),'evidence':str(evidence)}
        # Complete only after final source and artifact validation has succeeded.
        provenance.update(raw_sha256=sha(raw),manifest_sha256=pointer['manifest_sha256'],artifacts=inventory(web))
        provenance['complete'] = True
        (LOGS/'latest-extension-bundle.json').write_text(json.dumps(pointer,indent=2)+'\n')
        print(json.dumps(pointer),flush=True)
    except Exception as error:
        provenance.update(complete=False, failure_reason=f'{type(error).__name__}: {error}')
        raise
    finally:
        for dest in [bundle/'provenance.json',evidence/'provenance.json']:
            dest.write_text(json.dumps(provenance,indent=2)+'\n')

if __name__ == '__main__':
    main()
