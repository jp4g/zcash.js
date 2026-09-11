"""Bind preserved producing source, exact graph, raw module, link map and genuine glue."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tomllib

stage = Path(sys.argv[1])
source = Path('qualification/storage')
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
for p in (stage / 'source').rglob('*'):
    if p.is_file():
        assert sha(p) == sha(source / p.relative_to(stage / 'source')), 'producing source changed during build'
baseline = tomllib.loads(Path('qualification/runtime/Cargo.lock').read_text())
current = tomllib.loads((source / 'Cargo.lock').read_text())
packages = lambda lock: {p['name']: p for p in lock['package'] if p['name'] != 'issue-2-qualification'}
# Compare full package records by name+version (including dependency edges), not
# just version labels; duplicate-version registry crates remain distinguished.
records = lambda lock: {(p['name'], p['version']): p for p in lock['package'] if p['name'] != 'issue-2-qualification'}
assert records(baseline) == records(current), 'dependency package graph changed'
registry = Path('/home/jack/zcash-storage-scratch/cargo/registry/src/index.crates.io-1949cf8c6b5b557f')
wallet = registry / 'zakura-client-sqlite-0.1.0-rc4'
vcs = json.loads((wallet / '.cargo_vcs_info.json').read_text())
assert vcs['git']['sha1'] == 'a9142ee100b3a563b7d9ba7a8e94201d00ad8154'
pin = Path('/home/jack/zcash-qualification-scratch/wallet/librustzcash/zcash_client_sqlite')
for name in ['src/lib.rs', 'src/wallet/init.rs']:
    assert sha(wallet / name) == sha(pin / name), 'published wallet source differs from pin'
sdk = Path('/home/jack/zcash-qualification-scratch/wasi-sdk-27.0-x86_64-linux')
generator = Path('/home/jack/zcash-node-runtime-scratch/wasm-bindgen-0.2.128-x86_64-unknown-linux-musl/wasm-bindgen')
files = sorted(p for p in stage.rglob('*') if p.is_file() and p.name != 'provenance.json')
extras = [generator, sdk / 'bin/clang', sdk / 'share/wasi-sysroot/lib/wasm32-wasi/libc.a',
          wallet / '.cargo_vcs_info.json', wallet / 'src/lib.rs', wallet / 'src/wallet/init.rs',
          registry / 'libsqlite3-sys-0.35.0/sqlite3/sqlite3.c',
          registry / 'libsqlite3-sys-0.35.0/sqlite3/sqlite3.h']
artifact_hashes = {str(p.relative_to(stage)): {'sha256': sha(p), 'bytes': p.stat().st_size} for p in files}
result = {
    'build_command': f'bash qualification/storage/build.sh {stage}',
    'revision_at_build': subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
    'source_snapshot_is_authoritative': True,
    'rustc': subprocess.check_output(['rustc', '--version'], text=True).strip(),
    'node': subprocess.check_output(['node', '--version'], text=True).strip(),
    'generator': subprocess.check_output([str(generator), '--version'], text=True).strip(),
    'graph_unchanged_except_root_direct_edges': True,
    'wallet_vcs': vcs,
    'artifacts': artifact_hashes,
    'source_and_tool_inputs': {str(p): sha(p) for p in extras},
    'claims': 'Compiled isolated qualification; execution and independent review are separate evidence.',
}
(stage / 'provenance.json').write_text(json.dumps(result, indent=2) + '\n')
