"""Fixed review regressions, using disposable copies and the real source Git objects."""
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parent
results = []
with tempfile.TemporaryDirectory(prefix='verifier-', dir='/home/jack/zcash-transaction-codec-scratch') as temporary:
    tree = Path(temporary)
    root = tree / 'qualification/transaction-codec'
    shutil.copytree(ROOT, root)
    git_dir = subprocess.check_output(['git', 'rev-parse', '--absolute-git-dir'], cwd=ROOT, text=True).strip()
    (tree / '.git').write_text(f'gitdir: {git_dir}\n')
    original = json.loads((root / 'fixtures/provenance.json').read_text())
    for name in original['sources']:
        if not Path(name).is_absolute():
            dest = tree / name
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT.parents[1] / name, dest)
    for label in ['baseline', 'missing-source', 'false-common-version', 'false-common-revision',
                  'false-scanner-revision', 'changed-vector']:
        provenance = json.loads(json.dumps(original))
        if label == 'missing-source':
            provenance['sources'] = {n: v for n, v in provenance['sources'].items()
                                     if not n.endswith('/transaction/txid.rs')}
        for field in ['common_version', 'common_revision', 'scanner_revision']:
            if label == 'false-' + field.replace('_', '-'):
                provenance[field] = '1.1.0' if field == 'common_version' else '0' * 40
        (root / 'fixtures/provenance.json').write_text(json.dumps(provenance))
        raw = (ROOT / 'fixtures/vectors.json').read_bytes()
        (root / 'fixtures/vectors.json').write_bytes(raw + (b' ' if label == 'changed-vector' else b''))
        for optimized in [False, True]:
            argv = [sys.executable] + (['-O'] if optimized else []) + [str(root / 'verify-vectors.py')]
            result = subprocess.run(argv, capture_output=True, text=True)
            results.append({'case': label, 'optimized': optimized, 'exit': result.returncode,
                            'ok': (result.returncode == 0) == (label == 'baseline'),
                            'stdout': result.stdout, 'stderr': result.stderr})
print(json.dumps(results, indent=2))
if not all(result['ok'] for result in results):
    raise SystemExit(1)
