"""Validate one explicit run completely before retaining any evidence."""
import json
import hashlib
import os
from pathlib import Path

from fingerprints import ROOT, sources, producer_artifacts, messages


def collect(root, logs, run_id, destination=None):
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
    from contracts import commands, PLATFORMS
    expected = commands()
    labels = [r['label'] for r in records]
    link = next((r for r in records if r['label'] == 'repeat-wasm-link'), None)
    if link is None:
        raise ValueError('missing build stage inventory')
    if link['exit_code'] == 0:
        expected.pop('repeat-wasm-libc-diagnostic')
    if labels != list(expected):
        raise ValueError('missing, duplicate or out-of-order stages')
    by_label = {r['label']: r for r in records}
    target_dirs = {r.get('environment', {}).get('CARGO_TARGET_DIR') for r in records}
    if len(target_dirs) != 1 or None in target_dirs:
        raise ValueError('inconsistent effective target directory')
    target_dir = Path(next(iter(target_dirs)))
    if not target_dir.is_absolute() or target_dir.name != run_id:
        raise ValueError('run-specific absolute target directory required')
    if by_label['repeat-native'].get('target_existed_before') is not False:
        raise ValueError('native producer must start with absent target directory')
    current_artifacts = []
    for r in records:
        argv = expected[r['label']]
        if argv is None:
            platform = r['label'].removeprefix('repeat-audit-')
            producer = by_label['repeat-metadata-' + platform]
            argv = ['python3', 'qualification/audit.py', producer['log'], platform]
        if r.get('argv') != argv or r.get('cwd') != str(root.parent):
            raise ValueError('stage command mismatch')
        if r.get('timed_out') is not False or (r['exit_code'] != 0 and r['label'] not in
                ['repeat-wasm-link', 'repeat-wasm-libc-diagnostic']):
            raise ValueError('failed required stage')
        actual = producer_artifacts(r, messages(r['log']))
        if r.get('artifacts_after') != actual:
            raise ValueError('producer artifact fingerprint mismatch')
        current_artifacts.extend(dict(a, producer=r['label'], producer_log=r['log'],
                                      producer_sha256=r['sha256']) for a in actual)
    outputs = {}
    for target in ['x86_64-unknown-linux-gnu', 'wasm32-unknown-unknown']:
        matches = [r for r in records if r['label'] == 'repeat-audit-' + target]
        if len(matches) != 1 or matches[0]['exit_code'] != 0:
            raise ValueError('missing, duplicate or failed audit')
        audited = json.loads(Path(matches[0]['log']).read_text())
        if (audited.get('run_id') != run_id or audited.get('sources') != current or
                audited.get('lock_sha256') != current['consumer/Cargo.lock']):
            raise ValueError('audit run/source fingerprint mismatch')
        producer = by_label['repeat-metadata-' + target]
        binding = dict(log=producer['log'], sha256=producer['sha256'], target=target,
                       run_id=run_id, sources=current, argv=producer['argv'])
        if audited.get('metadata_input') != binding:
            raise ValueError('audit metadata input mismatch')
        rows = audited.pop('packages')
        for package in rows:
            package['dependencies'] = [
                {'name': d['name'], 'package': d['pkg'].split('#')[-1], 'kinds': d['dep_kinds']}
                for d in package['dependencies']]
        outputs['graph-' + target + '.jsonl'] = json.dumps(audited, sort_keys=True) + '\n' + ''.join(
            json.dumps(p, sort_keys=True) + '\n' for p in rows)
    outputs['artifacts.json'] = json.dumps(current_artifacts, indent=2) + '\n'
    outputs['commands.jsonl'] = ''.join(json.dumps(r, sort_keys=True) + '\n' for r in records)
    outputs['source-sha256.txt'] = ''.join(digest + '  ' + path + '\n' for path, digest in current.items())
    for r in records:
        if (hashlib.sha256(Path(r['log']).read_bytes()).hexdigest() != r['sha256']
                or producer_artifacts(r, messages(r['log'])) != r['artifacts_after']):
            raise ValueError('evidence changed during collection')
    if sources(root) != current:
        raise ValueError('inputs changed during collection')
    destination = Path(destination) if destination else root / 'evidence'
    if destination.exists() and any((destination / name).exists() for name in outputs):
        raise ValueError('refusing to overwrite retained evidence')
    destination.mkdir(parents=True, exist_ok=True)
    for name, data in outputs.items():
        (destination / name).write_text(data)
    print('Verified and retained', len(records), 'command records for run', run_id)


if __name__ == '__main__':
    collect(ROOT, Path('/home/jack/zcash-qualification-logs'), os.environ.get('QUALIFICATION_RUN_ID'), os.environ.get('QUALIFICATION_OUTPUT'))
