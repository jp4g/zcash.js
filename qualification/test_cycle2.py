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
            with patch('collect_evidence.sources', return_value=current), patch('collect_evidence.artifacts', return_value=[]), patch.object(Path, 'write_text') as write:
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
                        result = fingerprints.producer_artifacts(record, [] if mutation == 'failed' else [message])
                        self.assertEqual(result[0]['path'], str(wasm))
                        self.assertEqual(result[0]['status'], 'expected failed-link absence' if mutation == 'failed' else 'present')
