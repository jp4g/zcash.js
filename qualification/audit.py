"""Audit Cargo's actual resolved graph, features and registry source bytes."""
import hashlib
import json
import os
from pathlib import Path
import sys
import tarfile
import tomllib

from harness import audit_packages
from fingerprints import sources

ROOT = Path(__file__).resolve().parent


def audit(metadata):
    before = sources()
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
        consumer = tomllib.loads((ROOT / 'consumer/Cargo.toml').read_text())['package']
        if p['source'] is None and not (
                p['id'] == metadata['resolve']['root'] and
                path.resolve() == (ROOT / 'consumer/Cargo.toml').resolve() and
                p['name'] == consumer['name'] and p['version'] == consumer['version']):
            raise ValueError(f'non-registry dependency: {p["id"]}')
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
            elif p['name'].startswith('zakura-'):
                if row.get('vcs', {}).get('git', {}).get('sha1') != 'f4526b0fa86406589732c8fb3849855fb92c43a2':
                    raise ValueError('Common 1.0 source revision mismatch')
        rows.append(row)
    if sources() != before:
        raise ValueError('sources changed during audit')
    return {'run_id': os.environ.get('QUALIFICATION_RUN_ID'), 'sources': before,
            'status': 'audited registry archive and extracted files',
            'lock_sha256': hashlib.sha256((ROOT / 'consumer/Cargo.lock').read_bytes()).hexdigest(),
            'packages': sorted(rows, key=lambda p: (p['name'], p['version']))}


def metadata_input(path, target):
    from contracts import commands
    path = Path(path).resolve()
    run_id = os.environ.get('QUALIFICATION_RUN_ID')
    records = [json.loads(line) for line in (path.parent / 'commands.jsonl').read_text().splitlines()]
    matches = [r for r in records if r.get('run_id') == run_id and r.get('log') == str(path)]
    if not run_id or len(matches) != 1:
        raise ValueError('missing or duplicate same-run metadata producer')
    record = matches[0]
    current = sources()
    label = 'repeat-metadata-' + target
    data = path.read_bytes()
    if (record.get('label') != label or record.get('argv') != commands().get(label)
            or record.get('cwd') != str(ROOT.parent) or record.get('exit_code') != 0
            or record.get('timed_out') is not False
            or record.get('sources_before') != current or record.get('sources_after') != current
            or record.get('sha256') != hashlib.sha256(data).hexdigest()):
        raise ValueError('metadata producer/input/target/source mismatch')
    return json.loads(data), dict(log=str(path), sha256=record['sha256'], target=target,
                                  run_id=run_id, sources=current, argv=record['argv'])


if __name__ == '__main__':
    metadata, binding = metadata_input(sys.argv[1], sys.argv[2])
    result = audit(metadata)
    if result['sources'] != binding['sources']:
        raise ValueError('metadata sources changed before audit')
    result['metadata_input'] = binding
    print(json.dumps(result, indent=2, sort_keys=True))
