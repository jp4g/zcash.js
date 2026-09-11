"""Validate one explicit run completely before retaining any evidence."""
import json
import hashlib
import os
from pathlib import Path

from fingerprints import ROOT, sources, artifacts


def collect(root, logs, run_id):
    if not run_id:
        raise ValueError('explicit QUALIFICATION_RUN_ID required; historical records are unbound')
    records = [json.loads(line) for line in (logs / 'commands.jsonl').read_text().splitlines()]
    records = [r for r in records if r.get('run_id') == run_id]
    if not records:
        raise ValueError('no records for run')
    current = sources(root)
    for record in records:
        if record.get('sources_before') != current or record.get('sources_after') != current:
            raise ValueError('run source fingerprint mismatch')
        if hashlib.sha256(Path(record['log']).read_bytes()).hexdigest() != record['sha256']:
            raise ValueError('log checksum mismatch')
    outputs = {}
    for target in ['x86_64-unknown-linux-gnu', 'wasm32-unknown-unknown']:
        matches = [r for r in records if r['label'] == 'repeat-audit-' + target]
        if len(matches) != 1 or matches[0]['exit_code'] != 0:
            raise ValueError('missing, duplicate or failed audit')
        audited = json.loads(Path(matches[0]['log']).read_text())
        if (audited.get('run_id') != run_id or audited.get('sources') != current or
                audited.get('lock_sha256') != current['consumer/Cargo.lock']):
            raise ValueError('audit run/source fingerprint mismatch')
        rows = audited.pop('packages')
        for package in rows:
            package['dependencies'] = [
                {'name': d['name'], 'package': d['pkg'].split('#')[-1], 'kinds': d['dep_kinds']}
                for d in package['dependencies']]
        outputs['graph-' + target + '.jsonl'] = json.dumps(audited, sort_keys=True) + '\n' + ''.join(
            json.dumps(p, sort_keys=True) + '\n' for p in rows)
    # The final command snapshots the outputs of this run, including failed-link diagnostics.
    current_artifacts = artifacts()
    if records[-1].get('artifacts_after') != current_artifacts:
        raise ValueError('run artifact fingerprint mismatch')
    outputs['artifacts.json'] = json.dumps(current_artifacts, indent=2) + '\n'
    outputs['commands.jsonl'] = ''.join(json.dumps(r, sort_keys=True) + '\n' for r in records)
    outputs['source-sha256.txt'] = ''.join(digest + '  ' + path + '\n' for path, digest in current.items())
    if sources(root) != current or artifacts() != current_artifacts:
        raise ValueError('inputs changed during collection')
    for name, data in outputs.items():
        (root / 'evidence' / name).write_text(data)
    print('Verified and retained', len(records), 'command records for run', run_id)


if __name__ == '__main__':
    collect(ROOT, Path('/home/jack/zcash-qualification-logs'), os.environ.get('QUALIFICATION_RUN_ID'))
