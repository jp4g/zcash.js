"""Audit Cargo's actual resolved graph, features and registry source bytes."""
import hashlib
import json
import os
from pathlib import Path
import sys
import tarfile
import tomllib

from harness import audit_packages

ROOT = Path(__file__).resolve().parent


def audit(metadata):
    baseline = tomllib.loads((ROOT / 'evidence/wallet-Cargo.lock').read_text())
    expected = {p['name']: p['version'] for p in baseline['package']
                if p['name'].startswith('zakura-') and p['name'] != 'zakura-wallet-lib'}
    forbidden = tomllib.loads((ROOT / 'evidence/sources.toml').read_text())['graph']['forbidden']
    nodes = {n['id']: n for n in metadata['resolve']['nodes']}
    packages = [p for p in metadata['packages'] if p['id'] in nodes]
    audit_packages(packages, expected, forbidden)
    lock = tomllib.loads((ROOT / 'consumer/Cargo.lock').read_text())
    checksums = {(p['name'], p['version']): p.get('checksum') for p in lock['package']}
    rows = []
    for p in packages:
        path = Path(p['manifest_path'])
        row = {k: p[k] for k in ['name', 'version', 'source', 'rust_version']}
        row.update(features=nodes[p['id']]['features'], dependencies=nodes[p['id']]['deps'],
                   manifest_sha256=hashlib.sha256(path.read_bytes()).hexdigest())
        if p['source'] is not None:
            if not p['source'].startswith('registry+'):
                raise ValueError(f'non-registry dependency: {p["id"]}')
            archive = Path(os.environ['CARGO_HOME']) / 'registry/cache' / path.parent.parent.name / (path.parent.name + '.crate')
            digest = hashlib.sha256(archive.read_bytes()).hexdigest()
            if digest != checksums[(p['name'], p['version'])]:
                raise ValueError(f'archive checksum mismatch: {p["id"]}')
            with tarfile.open(archive) as tar:
                for member in tar.getmembers():
                    if member.isfile():
                        relative = Path(member.name).relative_to(path.parent.name)
                        if '..' in relative.parts:
                            raise ValueError('invalid archive path')
                        if (path.parent / relative).read_bytes() != tar.extractfile(member).read():
                            raise ValueError(f'modified extracted source: {p["id"]}/{relative}')
            row['archive_sha256'] = digest
            vcs = path.parent / '.cargo_vcs_info.json'
            if vcs.exists():
                row['vcs'] = json.loads(vcs.read_text())
            if p['name'] in ['zakura-client-backend', 'zakura-client-sqlite', 'zakura-pczt']:
                if row.get('vcs', {}).get('git', {}).get('sha1') != 'a9142ee100b3a563b7d9ba7a8e94201d00ad8154':
                    raise ValueError('wallet revision mismatch')
        rows.append(row)
    return {'status': 'audited registry archive and extracted files',
            'lock_sha256': hashlib.sha256((ROOT / 'consumer/Cargo.lock').read_bytes()).hexdigest(),
            'packages': sorted(rows, key=lambda p: (p['name'], p['version']))}


if __name__ == '__main__':
    print(json.dumps(audit(json.loads(Path(sys.argv[1]).read_text())), indent=2, sort_keys=True))
