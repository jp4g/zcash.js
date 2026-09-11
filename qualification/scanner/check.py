#!/usr/bin/env python3
"""Offline fixture/graph/source consistency checks; no gate-completion claim."""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tomllib

root = Path(__file__).resolve().parent
manifest = json.loads((root / 'fixtures/manifest.json').read_text())
for name, expected in manifest['files'].items():
    data = (root / 'fixtures' / name).read_bytes()
    assert len(data) == expected['bytes'], name
    assert hashlib.sha256(data).hexdigest() == expected['sha256'], name

packages = tomllib.loads((root / 'Cargo.lock').read_text())['package']
consumer = tomllib.loads((root.parent / 'consumer/Cargo.lock').read_text())['package']
selected = [p for p in packages if p['name'].startswith('zakura-')]
versions = {p['name']: p['version'] for p in selected}
assert len(versions) == len(selected), 'duplicate Zakura source identities'
assert versions == {p['name']: p['version'] for p in consumer if p['name'].startswith('zakura-')}
assert all(v == '1.0.0' for k, v in versions.items() if k not in ['zakura-client-backend', 'zakura-client-sqlite', 'zakura-pczt'])

for path in root.rglob('*'):
    if not path.is_file():
        continue
    if path.suffix == '.py':
        compile(path.read_text(), str(path), 'exec')
    if path.suffix == '.mjs':
        subprocess.run(['node', '--check', str(path)], check=True)
    if path.suffix in ['.rs', '.py', '.mjs', '.md', '.toml', '.html']:
        data = path.read_bytes()
        assert data.endswith(b'\n') and b'\0' not in data, path
        assert all(line.rstrip() == line for line in data.splitlines()), path
    if path.suffix == '.md':
        for target in re.findall(r'\]\(([^)]+)\)', path.read_text()):
            if not target.startswith(('https:', 'http:', '/')):
                assert (path.parent / target.split('#')[0]).exists(), (path, target)
subprocess.run(['git', 'diff', '--check'], cwd=root, check=True)
source = '/home/jack/zcash-qualification-scratch/wallet'
assert subprocess.check_output(['git', '-C', source, 'rev-parse', 'HEAD'], text=True).strip() == manifest['wallet_revision']
assert not subprocess.check_output(['git', '-C', source, 'status', '--porcelain'], text=True).strip()
print(json.dumps({'fixture_files_verified': len(manifest['files']), 'zakura_packages': versions,
                  'source_revision': manifest['wallet_revision'], 'source_clean': True,
                  'python_js_syntax': 'pass', 'whitespace_links': 'pass'}, indent=2))
