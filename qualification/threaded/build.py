"""Fresh source snapshot -> actual compiler -> approved generator; no glue editing."""
import hashlib, json, os, shutil, subprocess, time, tomllib
from pathlib import Path
ROOT = Path(__file__).resolve().parent
SCRATCH = Path('/home/jack/zcash-threaded-scratch')
LOGS = Path('/home/jack/zcash-threaded-logs')
GEN = Path('/home/jack/zcash-node-runtime-scratch/wasm-bindgen-0.2.128-x86_64-unknown-linux-musl/wasm-bindgen')
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
    assert os.environ['CARGO_TARGET_DIR'] == str(SCRATCH / 'target')
    assert os.environ['CARGO_HOME'] == str(SCRATCH / 'cargo')
    stage = SCRATCH / f'build-{time.time_ns()}'; stage.mkdir()
    sources = ['Cargo.toml','Cargo.lock','build.rs','adapter.c','src/lib.rs','src/baseline.rs','env.sh','build.py']
    record = dict(stage=str(stage), base='31ab65e4e09f9e0ade1517df3516f650fbca8496', sources={}, commands=[], artifacts={})
    def save(): (stage / 'provenance.json').write_text(json.dumps(record, indent=2)+'\n')
    def run(label, argv):
        path = LOGS / f'{stage.name}-{label}.log'
        command = dict(argv=argv, log=str(path), start=time.time(), cwd=str(ROOT))
        with path.open('wb') as log:
            try: command['exit'] = subprocess.run(argv, cwd=ROOT, stdout=log, stderr=subprocess.STDOUT, timeout=1200).returncode
            except subprocess.TimeoutExpired: command['exit'] = 'timeout'
        command.update(end=time.time(), sha256=sha(path)); record['commands'].append(command); save()
        if command['exit'] != 0: raise RuntimeError(f'{label}: {command}')
    for name in sources:
        dest = stage / 'sources' / name; dest.parent.mkdir(parents=True,exist_ok=True); shutil.copyfile(ROOT / name,dest)
        record['sources'][name] = sha(dest)
    baseline = tomllib.loads((ROOT.parent / 'runtime/Cargo.lock').read_text())['package']
    threaded = tomllib.loads((ROOT / 'Cargo.lock').read_text())['package']
    expected = [p for p in baseline if p['name'] != 'issue-2-qualification']
    actual = [p for p in threaded if p['name'] != 'issue-2-threaded-qualification']
    assert actual == expected, 'dependency lock drift beyond wrapper root'
    record['lock_family_unchanged'] = True
    record['generator_sha256'] = sha(GEN)
    assert record['generator_sha256'] == 'dc9e4f1e03996c26fb8bfedfded73d81120a37251c3f19eb87bb460f1f89a5be'
    record['environment'] = {k: v for k,v in os.environ.items() if k.startswith(('CARGO_', 'RUST', 'CFLAGS_', 'CC_', 'AR_', 'LIBSQLITE')) or k in ['TMPDIR', 'runtime_sdk']}
    save(); print(stage, flush=True)
    run('compiler', ['rustup','run','nightly-2026-09-01','rustc','-Vv'])
    run('features', ['cargo','tree','--offline','--locked','-e','features','--target','wasm32-unknown-unknown'])
    run('build', ['rustup','run','nightly-2026-09-01','cargo','build','-Z','build-std=std,panic_abort','--offline','--locked','--target','wasm32-unknown-unknown','--lib','--message-format=json'])
    target = SCRATCH / 'target'
    (stage / 'raw').mkdir()
    shutil.copyfile(target / 'wasm32-unknown-unknown/debug/issue_2_threaded_qualification.wasm', stage / 'raw/threaded.wasm')
    shutil.copyfile(target / 'threaded.map', stage / 'raw/threaded.map')
    record['producer_objects'] = {str(p):sha(p) for pat in ['**/out/adapter.o','**/out/*sqlite3.o'] for p in (target / 'wasm32-unknown-unknown/debug/build').glob(pat)}
    run('generate', [str(GEN),str(stage / 'raw/threaded.wasm'),'--target','web','--out-dir',str(stage / 'web'),'--out-name','qualification','--keep-lld-exports'])
    for name in sources: assert sha(ROOT / name) == record['sources'][name], 'source changed during build'
    record['artifacts'] = {str(p.relative_to(stage)):sha(p) for p in stage.rglob('*') if p.is_file() and p.name != 'provenance.json'}; save()
    (LOGS / 'latest-build.txt').write_text(str(stage)+'\n')
if __name__ == '__main__': main()
