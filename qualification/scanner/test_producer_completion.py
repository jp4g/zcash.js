"""Producer bookkeeping controls only: mocked cargo/bindgen, no WASM/runtime evidence."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent


def control(base, mutate):
    source = HERE / 'build-wasm.py'
    ns = {'__name__': 'bookkeeping_control', '__file__': str(source)}
    exec(compile(source.read_bytes(), str(source), 'exec'), ns)
    ns.update(SCRATCH=base/'scratch', LOGS=base/'logs')

    def producer(argv, **kwargs):
        if argv[0] == 'cargo':
            raw = base/'target/wasm32-unknown-unknown/debug/issue_2_scanner.wasm'
            raw.parent.mkdir(parents=True)
            raw.write_bytes(b'BOOKKEEPING CONTROL ONLY; NOT WASM')
            if mutate:
                copied = Path(kwargs['cwd'])/'src/lib.rs'
                copied.write_bytes(copied.read_bytes() + b'\n// bookkeeping mutation control\n')
        return subprocess.CompletedProcess(argv, 0)

    with patch.object(sys, 'argv', ['build-wasm.py', '--stage', 'control']), patch('subprocess.run', side_effect=producer), patch('subprocess.check_output', return_value='BOOKKEEPING CONTROL'), patch.dict(os.environ, CARGO_HOME=str(base/'cargo'), CARGO_TARGET_DIR=str(base/'target')):
        ns['main']()


class ProducerCompletion(unittest.TestCase):
    def test_final_source_validation_and_success_bookkeeping(self):
        for optimized in [False, True]:
            for mutate in [True, False]:
                with self.subTest(optimized=optimized, mutate=mutate), tempfile.TemporaryDirectory() as tmp:
                    base = Path(tmp)
                    argv = [sys.executable] + (['-O'] if optimized else [])
                    result = subprocess.run(argv + [str(Path(__file__).resolve()), '--control', tmp, str(int(mutate))], capture_output=True, text=True, timeout=30)
                    receipts = [json.loads((base/p/'bundles/control/provenance.json').read_text()) for p in ['scratch', 'logs']]
                    self.assertEqual(receipts[0], receipts[1])
                    receipt = receipts[0]
                    self.assertEqual([c['exit'] for c in receipt['commands']], [0, 0])
                    pointer = base/'logs/latest-extension-bundle.json'
                    if mutate:
                        self.assertNotEqual(result.returncode, 0)
                        self.assertIn('ValueError: build mutated source snapshot', result.stderr)
                        self.assertFalse(pointer.exists())
                        self.assertFalse(receipt['complete'])
                        self.assertEqual(receipt['failure_reason'], 'ValueError: build mutated source snapshot')
                    else:
                        self.assertEqual(result.returncode, 0, result.stderr)
                        self.assertTrue(receipt['complete'])
                        self.assertNotIn('failure_reason', receipt)
                        ns = {'__file__': str(HERE/'build-wasm.py'), '__name__': 'probe'}
                        exec(compile((HERE/'build-wasm.py').read_bytes(), 'build-wasm.py', 'exec'), ns)
                        bundle = base/'scratch/bundles/control'
                        self.assertEqual(receipt['sources'], ns['inventory'](bundle/'sources'))
                        self.assertEqual(receipt['artifacts'], ns['inventory'](bundle/'web'))
                        self.assertEqual(receipt['raw_sha256'], ns['sha'](bundle/'scanner.raw.wasm'))
                        self.assertEqual(receipt['manifest_sha256'], ns['sha'](bundle/'web/manifest.json'))
                        self.assertEqual(json.loads(pointer.read_text())['manifest_sha256'], receipt['manifest_sha256'])


if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == '--control':
        control(Path(sys.argv[2]), bool(int(sys.argv[3])))
    else:
        unittest.main(verbosity=2)
