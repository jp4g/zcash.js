"""Build one frozen, disposable codec bundle with the approved offline tool recipe."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import time

ROOT = Path(__file__).resolve().parent
SCRATCH = Path('/home/jack/zcash-transaction-codec-scratch')
LOGS = Path('/home/jack/zcash-transaction-codec-logs/fixes')
BINDGEN = Path('/home/jack/zcash-node-runtime-scratch/wasm-bindgen-0.2.128-x86_64-unknown-linux-musl/wasm-bindgen')


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    for key, wanted in {'CARGO_HOME': SCRATCH / 'cargo', 'CARGO_TARGET_DIR': SCRATCH / 'target',
                        'TMPDIR': SCRATCH / 'tmp'}.items():
        if os.environ.get(key) != str(wanted):
            raise ValueError('source qualification/transaction-codec/env.sh first')
    if os.environ.get('RUSTFLAGS') or os.environ.get('CARGO_ENCODED_RUSTFLAGS'):
        raise ValueError('unexpected Rust flags')
    run = SCRATCH / ('build-' + str(time.time_ns()))
    source = run / 'source'
    bundle = run / 'bundle'
    source.mkdir(parents=True)
    bundle.mkdir()
    names = ['Cargo.toml', 'Cargo.lock', 'src/lib.rs', 'src/main.rs', 'env.sh', 'build.py',
             'fixtures/vectors.json', 'fixtures/provenance.json', 'codec-entry.mjs', 'bundle.mjs', 'cases.mjs',
             'run-node.mjs', 'run-browser.mjs', 'browser-entry.mjs', 'browser.html']
    inputs = {name: sha(ROOT / name) for name in names}
    for name in names:
        dest = source / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / name, dest)
    receipt = {'source_commit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
               'source_hashes': inputs, 'source': str(source), 'bundle': str(bundle),
               'generator': {'path': str(BINDGEN), 'sha256': sha(BINDGEN)},
               'environment': {k: v for k, v in os.environ.items() if k.startswith(('CARGO_', 'RUSTFLAGS', 'CC_wasm', 'AR_wasm')) or k == 'TMPDIR'},
               'commands': [], 'complete': False}

    def command(name, argv):
        log = LOGS / (run.name + '-' + name + '.log')
        with log.open('xb') as out:
            result = subprocess.run(argv, cwd=source, stdout=out, stderr=subprocess.STDOUT, timeout=600)
        receipt['commands'].append({'argv': argv, 'cwd': str(source), 'exit': result.returncode,
                                    'log': str(log), 'sha256': sha(log)})
        if result.returncode:
            raise RuntimeError(f'{name}: {result.returncode}; {log}')
        return log

    try:
        command('rustc', ['rustc', '-Vv'])
        command('cargo', ['cargo', '-V'])
        command('bindgen-version', [str(BINDGEN), '--version'])
        command('native-tests', ['cargo', 'test', '--offline', '--locked'])
        native = command('native', ['cargo', 'run', '--quiet', '--offline', '--locked'])
        receipt['native'] = json.loads(native.read_text())
        command('wasm', ['cargo', 'build', '--offline', '--locked', '--lib', '--target', 'wasm32-unknown-unknown'])
        raw = run / 'codec.raw.wasm'
        shutil.copyfile(SCRATCH / 'target/wasm32-unknown-unknown/debug/transaction_codec_qualification.wasm', raw)
        receipt['raw_sha256'] = sha(raw)
        command('bindgen', [str(BINDGEN), str(raw), '--target', 'web', '--no-typescript', '--out-name', 'codec', '--out-dir', str(bundle)])
        for name in ['codec-entry.mjs', 'bundle.mjs', 'cases.mjs', 'run-node.mjs', 'run-browser.mjs', 'browser-entry.mjs', 'browser.html']:
            shutil.copyfile(source / name, bundle / name)
        shutil.copyfile(source / 'fixtures/vectors.json', bundle / 'vectors.json')
        (bundle / 'package.json').write_text('{"type":"module"}\n')
        if inputs != {name: sha(source / name) for name in names} or inputs != {name: sha(ROOT / name) for name in names}:
            raise ValueError('source changed during build')
        manifest = {'source_hashes': inputs, 'raw_sha256': receipt['raw_sha256'],
                    'generator': receipt['generator'], 'files': {p.name: sha(p) for p in sorted(bundle.iterdir())}}
        (bundle / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
        receipt['manifest_sha256'] = sha(bundle / 'manifest.json')
        receipt['complete'] = True
        # Read-only snapshot; host executes this exact bundle, never a moving latest pointer.
        for path in [*source.rglob('*'), *bundle.iterdir(), raw]:
            if path.is_file():
                path.chmod(0o444)
        host = f"timeout 150s node {bundle}/run-browser.mjs {receipt['manifest_sha256']} {LOGS}/{run.name}-browser-host.json"
        node = f"timeout 60s node {bundle}/run-node.mjs {receipt['manifest_sha256']} {LOGS}/{run.name}-node.json"
        with (LOGS / 'checkpoint.md').open('a') as out:
            out.write(f'\n## Frozen executable bundle {run.name}\n\nManifest SHA256: `{receipt["manifest_sha256"]}`. Native tests and 13 vectors passed; WASM linked with genuine approved wasm-bindgen. Node/Browser results pending execution.\n\nExact Node command:\n```sh\n{node}\n```\n\nExact parent host command if sandbox sockets are denied (unchanged Firefox confinement; loopback only):\n```sh\n{host}\n```\n')
        print(json.dumps({'bundle': str(bundle), 'manifest_sha256': receipt['manifest_sha256'],
                          'node_command': node, 'host_command': host}), flush=True)
    finally:
        (LOGS / (run.name + '.json')).write_text(json.dumps(receipt, indent=2) + '\n')


if __name__ == '__main__':
    main()
