import hashlib
import json
from pathlib import Path
import unittest
from unittest.mock import patch

import audit


class ProvenanceTests(unittest.TestCase):
    def test_only_exact_consumer_may_have_no_source(self):
        manifest = audit.ROOT / 'consumer/Cargo.toml'
        root = {'id': 'consumer', 'name': 'issue-2-qualification', 'version': '0.0.0',
                'source': None, 'rust_version': None, 'manifest_path': str(manifest)}
        def metadata(packages):
            return {'packages': packages, 'resolve': {'root': 'consumer', 'nodes': [
                {'id': p['id'], 'features': [], 'deps': []} for p in packages]}}
        with patch.object(audit, 'audit_packages'):
            audit.audit(metadata([root]))
            for changes in [{'id': 'local', 'name': 'zakura-bls12_381'},
                            {'manifest_path': str(audit.ROOT / 'evidence/wallet-Cargo.toml')},
                            {'name': 'impostor'}, {'version': '1.0.0'}]:
                bad = dict(root, **changes)
                with self.subTest(changes=changes), self.assertRaisesRegex(ValueError, 'non-registry'):
                    audit.audit(metadata([bad]))


class OptimizedTests(unittest.TestCase):
    def test_integrity_checks_survive_optimization(self):
        import subprocess
        import sys
        # Execute the actual scripts with synthetic reads and intercepted writes.
        for mode in ['revision', 'dirty', 'retained', 'sdk']:
            script = '''
import hashlib, json, runpy
from pathlib import Path
from unittest.mock import patch
mode = MODE
root = ROOT
record = {'label': 'repeat-audit-x86_64-unknown-linux-gnu', 'exit_code': 1 if mode == 'exit' else 0,
          'log': '/fixture/log', 'sha256': 'wrong' if mode == 'log' else hashlib.sha256(b'{}').hexdigest()}
def read_bytes(p):
    if str(p) == '/fixture/log': return b'{}'
    if mode == 'retained' and 'evidence' in p.parts: return b'changed'
    return b'fixture'
def git(args, **kw):
    if 'rev-parse' in args: return 'wrong' if mode == 'revision' else 'a9142ee100b3a563b7d9ba7a8e94201d00ad8154'
    return b'dirty' if mode == 'dirty' else b''
with patch('subprocess.check_output', side_effect=git), patch.object(Path, 'read_bytes', read_bytes), patch.object(Path, 'read_text', return_value=json.dumps(record)), patch.object(Path, 'write_text', side_effect=RuntimeError('WRITE REACHED')):
    try:
        runpy.run_path(str(root / ('collect_evidence.py' if mode in ['log', 'exit'] else 'verify_sources.py')))
    except ValueError:
        pass
    else:
        raise RuntimeError('integrity accepted')
'''.replace('MODE', repr(mode)).replace('ROOT', 'Path(' + repr(str(audit.ROOT)) + ')')
            with self.subTest(mode=mode):
                result = subprocess.run([sys.executable, '-O', '-c', script], capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, result.stderr)


class EvidenceBindingTests(unittest.TestCase):
    def test_stale_inputs_rejected_before_any_write(self):
        import runpy
        records = [json.loads(line) for line in (audit.ROOT / 'evidence/commands.jsonl').read_text().splitlines()]
        original = Path.read_bytes
        for mutation in ['lock', 'source', 'artifact', 'legacy']:
            def changed(path):
                if mutation == 'lock' and path == audit.ROOT / 'consumer/Cargo.lock':
                    return original(path) + b'\n'
                if mutation == 'source' and path == audit.ROOT / 'consumer/src/lib.rs':
                    return original(path) + b'\n'
                if mutation == 'artifact' and path.name == 'issue-2-qualification':
                    return original(path) + b'changed'
                return original(path)
            with self.subTest(mutation=mutation), patch.object(Path, 'read_bytes', changed), \
                    patch.object(Path, 'write_text') as write:
                with self.assertRaises(ValueError):
                    runpy.run_path(str(audit.ROOT / 'collect_evidence.py'), run_name='__main__')
                write.assert_not_called()

    def test_bound_run_and_each_mismatch(self):
        import tempfile
        from collect_evidence import collect
        for mutation in [None, 'source', 'lock', 'audit-run', 'record-run', 'artifact', 'log', 'exit']:
            with self.subTest(mutation=mutation), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                (root / 'evidence').mkdir()
                current = {'consumer/Cargo.lock': 'lock', 'consumer/src/lib.rs': 'source'}
                records = []
                for target in ['x86_64-unknown-linux-gnu', 'wasm32-unknown-unknown']:
                    audited = {'run_id': 'run', 'sources': dict(current), 'lock_sha256': 'lock', 'packages': []}
                    if mutation == 'audit-run': audited['run_id'] = 'other'
                    if mutation == 'lock': audited['lock_sha256'] = 'old'
                    path = root / (target + '.log')
                    path.write_text(json.dumps(audited))
                    records.append({'run_id': 'other' if mutation == 'record-run' else 'run',
                                    'sources_before': dict(current), 'sources_after': dict(current),
                                    'artifacts_after': [], 'label': 'repeat-audit-' + target,
                                    'exit_code': 1 if mutation == 'exit' else 0, 'log': str(path),
                                    'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
                if mutation == 'source': current['consumer/src/lib.rs'] = 'changed'
                if mutation == 'log': records[0]['sha256'] = 'wrong'
                (root / 'commands.jsonl').write_text(''.join(json.dumps(r) + '\n' for r in records))
                with patch('collect_evidence.sources', return_value=current), \
                        patch('collect_evidence.producer_artifacts', return_value=['changed'] if mutation == 'artifact' else []), \
                        patch.object(Path, 'write_text') as write:
                    with self.assertRaises(ValueError): collect(root, root, 'run')
                    write.assert_not_called()

    def test_recorder_binds_before_after_and_artifacts(self):
        import os
        import sys
        import tempfile
        from harness import run
        with tempfile.TemporaryDirectory() as tmp, \
                patch('harness.sources', side_effect=[{'source': 'before'}, {'source': 'after'}]), \
                patch('harness.producer_artifacts', return_value=[{'sha256': 'artifact'}]):
            result = run('fixture', [sys.executable, '-c', 'pass'], tmp,
                         env=dict(os.environ, QUALIFICATION_RUN_ID='fixture-run'))
            self.assertEqual(result['run_id'], 'fixture-run')
            self.assertEqual(result['sources_before'], {'source': 'before'})
            self.assertEqual(result['sources_after'], {'source': 'after'})
            self.assertEqual(result['artifacts_after'], [{'sha256': 'artifact'}])
