"""Add shared consumer files alongside preserved, unmodified generated outputs."""
import hashlib
import json
from pathlib import Path
import shutil
import sys
stage = Path(sys.argv[1]).resolve()
provenance = json.loads((stage / 'provenance.json').read_text())
def digest(p): return hashlib.sha256(p.read_bytes()).hexdigest()
for name, expected in provenance['artifacts'].items():
    if digest(stage / name) != expected:
        raise ValueError('changed generated/source artifact: ' + name)
output = Path(sys.argv[2]).resolve() if len(sys.argv) > 2 else stage
if output != stage:
    output.mkdir()
    for target in ['web', 'nodejs']:
        (output / target).mkdir()
        for name in provenance['artifacts']:
            if name.startswith(target + '/'):
                shutil.copyfile(stage / name, output / name)
consumer = {}
for target in ['web', 'nodejs']:
    for name in ['runtime-host.mjs', 'loader.mjs']:
        dst = output / target / name
        if dst.exists():
            raise FileExistsError(dst)
        shutil.copyfile(Path(__file__).parent / name, dst)
        consumer[str(dst.relative_to(output))] = digest(dst)
    dst = output / target / 'package.json'
    dst.write_text(json.dumps({'private':True,'type':'module' if target == 'web' else 'commonjs'})+'\n')
    consumer[str(dst.relative_to(output))] = digest(dst)
(output / 'consumer-provenance.json').write_text(json.dumps(dict(generated_stage=str(stage), generated_provenance_sha256=digest(stage / 'provenance.json'), files={str(p.relative_to(output)):digest(p) for p in output.rglob('*') if p.is_file() and p.name != 'consumer-provenance.json'}),indent=2)+'\n')
print(json.dumps(dict(generated_stage=str(stage), generated_provenance_sha256=digest(stage / 'provenance.json'), files={str(p.relative_to(output)):digest(p) for p in output.rglob('*') if p.is_file() and p.name != 'consumer-provenance.json'}),indent=2))
