"""Fresh isolated producing build, immutable source capture, real generator outputs."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from harness import run

ROOT = Path(__file__).resolve().parents[2]
SCRATCH = Path('/home/jack/zcash-generated-runtime-scratch')
LOGS = Path('/home/jack/zcash-generated-runtime-logs')
GENERATOR = Path('/home/jack/zcash-node-runtime-scratch/wasm-bindgen-0.2.128-x86_64-unknown-linux-musl/wasm-bindgen')

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    stage = SCRATCH / ('build-' + str(time.time_ns()))
    stage.mkdir()
    sources = ['Cargo.toml', 'Cargo.lock', 'build.rs', 'adapter.c', 'src/lib.rs', 'env.sh', 'build-generated.py']
    before = {}
    for name in sources:
        src = ROOT / 'qualification/runtime' / name
        dst = stage / 'sources' / name
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(src, dst)
        before[name] = digest(src)
    provenance = dict(stage=str(stage), sources_before=before,
                      source_commit=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),
                      generator_sha256=digest(GENERATOR),
                      archive_sha256='b51f0208fdff83515a787bd8ab9ac5865ed84dabb66d0c709957bb59793c645f')
    # The environment sets the new exclusive target. Old cache is offline/read-only.
    if os.environ.get('CARGO_TARGET_DIR') != str(SCRATCH / 'target'):
        raise RuntimeError('source qualification/runtime/env.sh first')
    def command(label, argv):
        record = run(label, argv, LOGS, timeout=900)
        provenance.setdefault('commands', []).append(record)
        (stage / 'provenance.json').write_text(json.dumps(provenance,indent=2)+'\n')
        if record['exit_code'] != 0:
            raise RuntimeError(f'{label} failed: {record}')
        return record
    command('fresh-raw-build', ['cargo','build','--offline','--locked','--manifest-path',
            'qualification/runtime/Cargo.toml','--target','wasm32-unknown-unknown','--lib','--message-format=json'])
    after = {name:digest(ROOT / 'qualification/runtime' / name) for name in sources}
    if before != after:
        raise RuntimeError('producing sources changed during build')
    provenance['sources_after'] = after
    build_record = provenance['commands'][0]
    messages = []
    for line in Path(build_record['log']).read_text().splitlines():
        if line.startswith('{'):
            messages.append(json.loads(line))
    producers = [m for m in messages if m.get('reason') == 'compiler-artifact'
                 and m.get('manifest_path') == str(ROOT / 'qualification/runtime/Cargo.toml')
                 and 'cdylib' in m.get('target', {}).get('crate_types', [])]
    if len(producers) != 1 or producers[0]['fresh']:
        raise RuntimeError('expected one fresh producing compiler artifact')
    provenance['compiler_artifact'] = producers[0]
    raw_dir = stage / 'raw'
    raw_dir.mkdir()
    target = SCRATCH / 'target'
    raw = raw_dir / 'issue_2_qualification.wasm'
    shutil.copyfile(target / 'wasm32-unknown-unknown/debug/issue_2_qualification.wasm',raw)
    shutil.copyfile(target / 'runtime.map',raw_dir / 'runtime.map')
    provenance['producer_objects'] = {str(p):digest(p) for pattern in ['*/out/adapter.o','*/out/*sqlite3.o']
                                    for p in (target / 'wasm32-unknown-unknown/debug/build').glob(pattern)}
    for mode in ['web','nodejs']:
        command('fresh-generate-'+mode, [str(GENERATOR),str(raw),'--target',mode,'--out-dir',str(stage / mode),
                                       '--out-name','qualification','--keep-lld-exports'])
    provenance['artifacts'] = {str(p.relative_to(stage)):digest(p) for p in stage.rglob('*')
                               if p.is_file() and p.name != 'provenance.json'}
    (stage / 'provenance.json').write_text(json.dumps(provenance,indent=2)+'\n')
    print(stage,flush=True)

if __name__ == '__main__':
    main()
