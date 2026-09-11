"""Input and output identities for a single disposable qualification run."""
import hashlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SCRATCH = Path('/home/jack/zcash-qualification-scratch')


def sources(root=ROOT):
    return {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted(root.rglob('*')) if p.is_file() and
            (p.suffix in ['.py', '.sh', '.rs', '.toml'] or p.name.endswith('Cargo.lock'))}


def identity(path):
    path = Path(path)
    if not path.is_file():
        raise ValueError('missing required artifact: ' + str(path))
    return dict(path=str(path), status='present', bytes=path.stat().st_size,
                sha256=hashlib.sha256(path.read_bytes()).hexdigest())


def messages(path):
    import json
    result = []
    for line in Path(path).read_text().splitlines():
        try:
            item = json.loads(line)
        except ValueError:
            continue
        if isinstance(item, dict):
            result.append(item)
    return result


def producer_artifacts(record, events):
    label = record['label']
    if label not in ['repeat-native', 'repeat-wasm-check', 'repeat-wasm-link', 'repeat-wasm-libc-diagnostic']:
        return []
    target = Path(record['environment']['CARGO_TARGET_DIR'])
    if not target.is_absolute():
        raise ValueError('absolute effective target directory required')
    target = target.resolve()
    if record['exit_code'] != 0:
        if (record['exit_code'] != 101 or not any(e.get('reason') == 'build-finished' and e.get('success') is False for e in events)
                or not any(e.get('reason') == 'compiler-message' and 'linking with' in e.get('message', {}).get('message', '') for e in events)):
            raise ValueError('failure is not an observed Cargo failed link')
    paths = set()
    for event in events:
        if event.get('reason') == 'compiler-artifact':
            paths.update(event.get('filenames', []))
        if event.get('reason') == 'build-script-executed' and 'libsqlite3-sys' in event.get('package_id', ''):
            out = Path(event['out_dir']).resolve()
            if not out.is_relative_to(target):
                raise ValueError('build script outside effective target directory')
            objects = list(out.glob('*sqlite3.o'))
            if not objects:
                raise ValueError('missing SQLite build output')
            paths.update(str(p) for p in objects)
    for path in paths:
        if not Path(path).resolve().is_relative_to(target):
            raise ValueError('artifact outside effective target directory')
    if label == 'repeat-native':
        expected = target / 'debug/issue-2-qualification'
    elif label == 'repeat-wasm-check':
        if not any('sqlite3.o' in p and '/wasm32-unknown-unknown/' in p for p in paths):
            raise ValueError('missing target SQLite producer')
        expected = None
    else:
        expected = target / 'wasm32-unknown-unknown/debug/issue_2_qualification.wasm'
    result = []
    if expected is not None:
        if record['exit_code'] == 0:
            if str(expected) not in paths:
                raise ValueError('missing expected Cargo artifact producer')
        else:
            if expected.exists():
                raise ValueError('failed link left unexpected final module')
            result.append(dict(path=str(expected), status='expected failed-link absence'))
    result.extend(identity(Path(p).resolve()) for p in sorted(paths))
    return result
