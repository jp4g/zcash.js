"""Regression controls run real harmless runner children; build producers are intercepted."""
import contextlib
import hashlib
import io
import json
import os
from pathlib import PosixPath as Path
import subprocess
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent

class ReviewedGuards(unittest.TestCase):
    def runner(self, base):
        ns = {'__file__': str(ROOT/'run.py'), '__name__': 'probe'}
        exec(compile((ROOT/'run.py').read_bytes(), str(ROOT/'run.py'), 'exec'), ns)
        ns.update(ROOT=base, LOGS=base, SCRATCH=base)
        return ns

    def test_runner_duplicate_and_invalid(self):
        for label in ['reused', '../escape', 'absolute', '', 'bad.label']:
            with self.subTest(label=label), tempfile.TemporaryDirectory() as tmp:
                base = Path(tmp)
                if label == 'absolute':
                    label = str(base/'absolute')
                ns = self.runner(base)
                victim = base/'reused.log'
                victim.write_text('ORIGINAL EVIDENCE\n')
                with patch.object(sys, 'argv', ['run.py', label, '2', sys.executable, '-c', 'print("REPLACED")']), patch('subprocess.Popen', side_effect=RuntimeError('child unexpectedly started')) as child:
                    with self.assertRaises((ValueError, FileExistsError, AssertionError)):
                        ns['main']()
                    child.assert_not_called()
                self.assertEqual(victim.read_text(), 'ORIGINAL EVIDENCE\n')
                self.assertFalse((base/'commands.jsonl').exists())

    def test_runner_concurrent_exclusive_creation(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            ns = self.runner(base)
            barrier = threading.Barrier(2)
            original_open = Path.open
            def synchronized_open(path, mode='r', *args, **kwargs):
                if path.name == 'race.log' and mode in ('wb', 'xb'):
                    barrier.wait(timeout=5)
                return original_open(path, mode, *args, **kwargs)
            results = []
            def run():
                try: results.append(ns['main']())
                except FileExistsError: results.append('exists')
            with patch.object(sys, 'argv', ['run.py', 'race', '5', sys.executable, '-c', 'print("ONE CHILD")']), patch.object(Path, 'open', synchronized_open), contextlib.redirect_stdout(io.StringIO()):
                threads = [threading.Thread(target=run) for _ in range(2)]
                for thread in threads: thread.start()
                for thread in threads: thread.join(10)
            self.assertCountEqual(results, [0, 'exists'])
            self.assertEqual((base/'race.log').read_text(), 'ONE CHILD\n')
            self.assertEqual(len((base/'commands.jsonl').read_text().splitlines()), 1)

    def test_checker_provenance_drift(self):
        source = ROOT/'check.py'
        for drift in ['size', 'digest', 'version', 'duplicate', 'common', 'revision', 'dirty']:
            with self.subTest(drift=drift), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)/'scanner'
                (root/'fixtures').mkdir(parents=True)
                (root/'references').mkdir()
                (root/'references/manifest.json').write_text(json.dumps({'files': {}}))
                (root.parent/'consumer').mkdir()
                data = b'fixture\n'
                (root/'fixtures/a').write_bytes(data)
                manifest = {'files': {'a': {'bytes': len(data) + (drift == 'size'), 'sha256': 'bad' if drift == 'digest' else hashlib.sha256(data).hexdigest()}}, 'wallet_revision': 'pinned'}
                (root/'fixtures/manifest.json').write_text(json.dumps(manifest))
                lock = '[[package]]\nname="zakura-common"\nversion="1.0.0"\n'
                (root.parent/'consumer/Cargo.lock').write_text(lock.replace('1.0.0', '2.0.0') if drift == 'common' else lock)
                (root/'Cargo.lock').write_text(lock*2 if drift == 'duplicate' else lock.replace('1.0.0', '2.0.0') if drift in ['version', 'common'] else lock)
                def output(cmd, **kwargs):
                    return ('wrong' if drift == 'revision' else 'pinned') if 'rev-parse' in cmd else (' M changed' if drift == 'dirty' else '')
                with patch('subprocess.run'), patch('subprocess.check_output', output), contextlib.redirect_stdout(io.StringIO()):
                    with self.assertRaises((ValueError, AssertionError)):
                        exec(compile(source.read_bytes(), str(source), 'exec'), {'__file__': str(root/'check.py')})

if __name__ == '__main__':
    unittest.main(verbosity=2)
