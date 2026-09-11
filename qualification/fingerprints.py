"""Input and output identities for a single disposable qualification run."""
import hashlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SCRATCH = Path('/home/jack/zcash-qualification-scratch')


def sources(root=ROOT):
    return {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted(root.rglob('*')) if p.is_file() and
            (p.suffix in ['.py', '.sh', '.rs', '.toml'] or p.name.endswith('Cargo.lock'))}


def artifacts():
    paths = [SCRATCH / 'target/debug/issue-2-qualification',
             SCRATCH / 'wasi-sdk-27.0-x86_64-linux/bin/clang',
             SCRATCH / 'wasi-sdk-27.0-x86_64-linux/share/wasi-sysroot/lib/wasm32-wasi/libc.a']
    paths += sorted((SCRATCH / 'target/wasm32-unknown-unknown/debug/build').glob('libsqlite3-sys-*/out/*sqlite3.o'))
    return [{'path': str(p), 'bytes': p.stat().st_size,
             'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in paths if p.is_file()]
