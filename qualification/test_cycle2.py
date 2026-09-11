"""Regressions for the two remaining provenance findings."""
import hashlib
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import audit
import fingerprints
from collect_evidence import collect


class Cycle2Tests(unittest.TestCase):
    def test_metadata_input_requires_producer(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'metadata.log'
            path.write_text('{}')
            current = {'consumer/Cargo.toml': 'with-js'}
            target = 'wasm32-unknown-unknown'
            record = dict(run_id='run', label='repeat-metadata-' + target,
                          argv=['cargo', 'metadata', '--offline', '--locked', '--manifest-path',
                                'qualification/consumer/Cargo.toml', '--format-version', '1',
                                '--filter-platform', target], cwd=str(audit.ROOT.parent),
                          exit_code=0, timed_out=False, log=str(path),
                          sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
                          sources_before=current.copy(), sources_after=current.copy())
            index = Path(tmp) / 'commands.jsonl'
            index.write_text(json.dumps(record) + '\n')
            for mutation in ['valid', 'manifest', 'stale', 'target', 'run']:
                with self.subTest(mutation=mutation):
                    changed = dict(current)
                    if mutation == 'manifest': changed['consumer/Cargo.toml'] = 'without-js'
                    if mutation == 'stale': path.write_text('{"stale":true}')
                    else: path.write_text('{}')
                    with patch('audit.sources', return_value=changed), patch.dict(os.environ, QUALIFICATION_RUN_ID='other' if mutation == 'run' else 'run'):
                        if mutation == 'valid':
                            audit.metadata_input(path, target)
                        else:
                            with self.assertRaises(ValueError):
                                audit.metadata_input(path, 'x86_64-unknown-linux-gnu' if mutation == 'target' else target)

    def test_audits_only_historical_binary_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'evidence').mkdir()
            current = {'consumer/Cargo.lock': 'lock'}
            records = []
            for target in ['x86_64-unknown-linux-gnu', 'wasm32-unknown-unknown']:
                path = root / target
                path.write_text(json.dumps(dict(run_id='run', sources=current, lock_sha256='lock', packages=[])))
                records.append(dict(run_id='run', sources_before=current, sources_after=current,
                                    label='repeat-audit-' + target, exit_code=0, log=str(path),
                                    sha256=hashlib.sha256(path.read_bytes()).hexdigest(), artifacts_after=[]))
            (root / 'commands.jsonl').write_text(''.join(json.dumps(r)+'\n' for r in records))
            with patch('collect_evidence.sources', return_value=current), patch('collect_evidence.producer_artifacts', return_value=[]), patch.object(Path, 'write_text') as write:
                with self.assertRaises(ValueError): collect(root, root, 'run')
                write.assert_not_called()

    def test_producer_outputs_missing_wrong_target_and_final_wasm(self):
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / 'target'
            wasm = target / 'wasm32-unknown-unknown/debug/issue_2_qualification.wasm'
            wasm.parent.mkdir(parents=True)
            record = dict(label='repeat-wasm-link', exit_code=0, environment={'CARGO_TARGET_DIR': str(target)}, cwd=tmp)
            message = dict(reason='compiler-artifact', target={'name': 'issue_2_qualification'}, filenames=[str(wasm)])
            for mutation in ['missing', 'wrong-target', 'valid', 'failed']:
                with self.subTest(mutation=mutation):
                    if mutation != 'missing': wasm.write_bytes(b'wasm fixture')
                    record['exit_code'] = 101 if mutation == 'failed' else 0
                    record['environment']['CARGO_TARGET_DIR'] = str(Path(tmp) / 'other' if mutation == 'wrong-target' else target)
                    if mutation == 'failed': wasm.unlink()
                    if mutation in ['missing', 'wrong-target']:
                        with self.assertRaises(ValueError): fingerprints.producer_artifacts(record, [message])
                    else:
                        result = fingerprints.producer_artifacts(record, [dict(reason='build-finished', success=False), dict(reason='compiler-message', message={'message': 'linking with rust-lld failed'})] if mutation == 'failed' else [message])
                        self.assertEqual(result[0]['path'], str(wasm))
                        self.assertEqual(result[0]['status'], 'expected failed-link absence' if mutation == 'failed' else 'present')

    def test_complete_collection_and_mutations_before_writes(self):
        from contracts import commands
        from fingerprints import producer_artifacts, messages
        for mutation in [None, 'metadata-input', 'target-label', 'manifest', 'missing', 'wrong-path', 'historical', 'snapshot']:
            with self.subTest(mutation=mutation), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp) / 'qualification'
                root.mkdir()
                target_dir = Path(tmp) / 'run'
                binary = target_dir / 'debug/issue-2-qualification'
                obj = target_dir / 'wasm32-unknown-unknown/debug/build/libsqlite3-sys-fixture/out/sqlite3.o'
                for p in [binary, obj]:
                    p.parent.mkdir(parents=True, exist_ok=True)
                    p.write_bytes(b'fixture')
                current = {'consumer/Cargo.lock': 'lock', 'consumer/Cargo.toml': 'js'}
                records = []
                for label, argv in commands().items():
                    path = root / (label + '.log')
                    data = []
                    if label == 'repeat-native':
                        data = [dict(reason='compiler-artifact', filenames=[str(binary)])]
                    if label == 'repeat-wasm-check':
                        data = [dict(reason='build-script-executed', package_id='libsqlite3-sys', out_dir=str(obj.parent))]
                    if label in ['repeat-wasm-link', 'repeat-wasm-libc-diagnostic']:
                        data = [dict(reason='build-finished', success=False), dict(reason='compiler-message', message={'message': 'linking with rust-lld failed'})]
                    if argv is None:
                        producer = records[-1]
                        platform = label.removeprefix('repeat-audit-')
                        argv = ['python3', 'qualification/audit.py', producer['log'], platform]
                        data = [dict(run_id='run', sources=current, lock_sha256='lock', packages=[],
                                     metadata_input=dict(log=producer['log'], sha256=producer['sha256'], target=platform,
                                                         run_id='run', sources=current, argv=producer['argv']))]
                    path.write_text('\n'.join(json.dumps(x) for x in data) or '{}')
                    r = dict(run_id='run', label=label, argv=argv, cwd=str(root.parent), log=str(path),
                             sha256=hashlib.sha256(path.read_bytes()).hexdigest(), sources_before=current.copy(),
                             sources_after=current.copy(), environment={'CARGO_TARGET_DIR': str(target_dir)},
                             target_existed_before=False, exit_code=101 if label in ['repeat-wasm-link', 'repeat-wasm-libc-diagnostic'] else 0,
                             timed_out=False)
                    r['artifacts_after'] = producer_artifacts(r, messages(path))
                    records.append(r)
                if mutation == 'metadata-input':
                    r = records[4]
                    data = json.loads(Path(r['log']).read_text())
                    data['metadata_input']['sha256'] = 'stale'
                    Path(r['log']).write_text(json.dumps(data))
                    r['sha256'] = hashlib.sha256(Path(r['log']).read_bytes()).hexdigest()
                if mutation == 'target-label': records[3]['argv'][-1] = 'wasm32-unknown-unknown'
                if mutation == 'manifest': current['consumer/Cargo.toml'] = 'no-js'
                if mutation == 'missing': binary.unlink()
                if mutation == 'wrong-path':
                    for r in records: r['environment']['CARGO_TARGET_DIR'] = str(Path(tmp) / 'other/run')
                if mutation == 'historical': records[2]['target_existed_before'] = True
                if mutation == 'snapshot': binary.write_bytes(b'stale changed binary')
                (root / 'commands.jsonl').write_text(''.join(json.dumps(r)+'\n' for r in records))
                with patch('collect_evidence.sources', return_value=current), patch.object(Path, 'write_text') as write:
                    if mutation:
                        with self.assertRaises(ValueError): collect(root, root, 'run')
                        write.assert_not_called()
                    else:
                        collect(root, root, 'run')
                        self.assertEqual(write.call_count, 5)
