"""Retain normalized evidence and command metadata, never full build logs."""
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parent
logs = Path('/home/jack/zcash-qualification-logs')
records = [json.loads(line) for line in (logs / 'commands.jsonl').read_text().splitlines()]
for record in records:
    if hashlib.sha256(Path(record['log']).read_bytes()).hexdigest() != record['sha256']:
        raise ValueError('log checksum mismatch')
for record in records:
    if 'audit-' in record['label'] and record['exit_code'] != 0:
        raise ValueError('audit failed')
(root / 'evidence/commands.jsonl').write_text(''.join(json.dumps(r, sort_keys=True) + '\n' for r in records))
for target in ['x86_64-unknown-linux-gnu', 'wasm32-unknown-unknown']:
    record = next(r for r in reversed(records) if r['label'] == 'repeat-audit-' + target)
    if record['exit_code'] != 0:
        raise ValueError('audit failed')
    audited = json.loads(Path(record['log']).read_text())
    rows = []
    for package in audited['packages']:
        package['dependencies'] = [
            {'name': d['name'], 'package': d['pkg'].split('#')[-1], 'kinds': d['dep_kinds']}
            for d in package['dependencies']]
        rows.append(package)
    (root / 'evidence' / ('graph-' + target + '.jsonl')).write_text(
        json.dumps({k: v for k, v in audited.items() if k != 'packages'}, sort_keys=True) + '\n' +
        ''.join(json.dumps(p, sort_keys=True) + '\n' for p in rows))
    print(target, len(rows), 'packages; all archive and extracted source checks passed')
files = [p for p in root.rglob('*') if p.is_file() and
         (p.suffix in ['.py', '.sh', '.rs', '.toml'] or p.name.endswith('Cargo.lock'))]
(root / 'evidence/source-sha256.txt').write_text(''.join(
    hashlib.sha256(p.read_bytes()).hexdigest() + '  ' + str(p.relative_to(root)) + '\n'
    for p in sorted(files)))
scratch = Path('/home/jack/zcash-qualification-scratch')
artifacts = [scratch / 'target/debug/issue-2-qualification',
             scratch / 'wasi-sdk-27.0-x86_64-linux/bin/clang',
             scratch / 'wasi-sdk-27.0-x86_64-linux/share/wasi-sysroot/lib/wasm32-wasi/libc.a']
artifacts += list((scratch / 'target/wasm32-unknown-unknown/debug/build').glob('libsqlite3-sys-*/out/*sqlite3.o'))
(root / 'evidence/artifacts.json').write_text(json.dumps([
    {'path': str(p), 'bytes': p.stat().st_size, 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()}
    for p in artifacts], indent=2) + '\n')
print('Verified and retained', len(records), 'command records; full logs remain outside git')
