#!/usr/bin/env python3
"""Regression controls for evidence integrity, including optimized producer Python."""
import contextlib
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent

def load(name, optimize, root):
    namespace = {'__name__':'guard_probe', '__file__':str(root / name)}
    exec(compile((HERE / name).read_text(), str(HERE / name), 'exec', optimize=optimize), namespace)
    return namespace

class Guards(unittest.TestCase):
    def test_duplicate_and_invalid_labels_ordinary_and_optimized(self):
        for optimize in [0,1,2]:
            with tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp); logs = root/'logs'; logs.mkdir()
                ns = load('run.py',optimize,root)
                ns.update(ROOT=root,LOGS=logs,SCRATCH=root)
                retained = logs/'retained.log'; retained.write_text('ORIGINAL')
                for label, error in [('retained',FileExistsError),('../escape',ValueError)]:
                    with patch.object(sys,'argv',['run.py',label,'5',sys.executable,'-c','print("REPLACED")']), contextlib.redirect_stdout(io.StringIO()):
                        with self.assertRaises(error): ns['main']()
                    self.assertEqual(retained.read_text(),'ORIGINAL')
                    self.assertFalse((root/'escape.log').exists())
    def test_deadline_checked_before_spawn(self):
        for optimize in [0,1]:
            with tempfile.TemporaryDirectory() as tmp:
                root=Path(tmp); ns=load('run.py',optimize,root); ns.update(ROOT=root,LOGS=root/'logs',SCRATCH=root)
                for value in ['0','-1','nan','inf','bad']:
                    with patch.object(sys,'argv',['run.py','deadline',value,'unused']), patch('subprocess.Popen',side_effect=RuntimeError('spawn must not occur')):
                        with self.assertRaises(ValueError): ns['main']()
    def test_build_input_mismatch_under_optimization(self):
        for optimize in [0,1,2]:
            with tempfile.TemporaryDirectory() as tmp:
                root=Path(tmp); adapter=root/'adapter.c'; host=root/'host.mjs'; bindgen=root/'bindgen'
                for path in [adapter,host,bindgen]: path.write_text('CHANGED')
                ns=load('build-wasm.py',optimize,root)
                ns.update(ROOT=root,SCRATCH=root/'scratch',LOGS=root/'logs',ADAPTER=adapter,HOST=host,BINDGEN=bindgen)
                with patch.object(sys,'argv',['build-wasm.py','--stage','guard']), patch('subprocess.run',side_effect=RuntimeError('producer must not occur')), patch('subprocess.check_output',return_value='fake-head'), patch.dict(os.environ,CARGO_HOME=str(root),CARGO_TARGET_DIR=str(root)):
                    with self.assertRaisesRegex(ValueError,'input drift'): ns['main']()
                self.assertFalse((root/'scratch/bundles/guard').exists())
    def test_check_rejects_changed_fixture_under_optimization(self):
        for optimize in [0,1,2]:
            with tempfile.TemporaryDirectory() as tmp:
                root=Path(tmp); (root/'fixtures').mkdir()
                (root/'fixtures/bad.pb').write_bytes(b'CHANGED')
                (root/'fixtures/manifest.json').write_text(json.dumps({'files':{'bad.pb':{'bytes':7,'sha256':'0'*64}}}))
                with self.assertRaisesRegex(ValueError,'fixture'):
                    load('check.py',optimize,root)

if __name__=='__main__': unittest.main()
