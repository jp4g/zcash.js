import copy
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
        for mode in ['revision', 'dirty', 'retained', 'sdk', 'log', 'exit']:
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
