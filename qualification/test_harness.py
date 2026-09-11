import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest

from harness import run, audit_packages


class HarnessTests(unittest.TestCase):
    def test_exit_and_digest(self):
        with tempfile.TemporaryDirectory() as tmp:
            record = run('failure', [sys.executable, '-c', 'print("fixture"); raise SystemExit(7)'], Path(tmp), timeout=2)
            self.assertEqual(record['exit_code'], 7)
            self.assertEqual(record['sha256'], hashlib.sha256(Path(record['log']).read_bytes()).hexdigest())
            self.assertEqual(json.loads((Path(tmp) / 'commands.jsonl').read_text()), record)

    def test_timeout(self):
        with tempfile.TemporaryDirectory() as tmp:
            record = run('timeout', [sys.executable, '-c', 'import time; time.sleep(10)'], Path(tmp), timeout=0.05)
            self.assertEqual(record['exit_code'], 124)
            self.assertTrue(record['timed_out'])

    def test_reject_mixed_missing_and_upstream(self):
        expected = {'zakura-proofs': '1.0.0', 'zakura-orchard': '1.0.0'}
        good = [{'name': k, 'version': v} for k, v in expected.items()]
        audit_packages(good, expected, ['orchard'])
        for bad in [good[:1], good + [{'name': 'orchard', 'version': '0.15.0'}],
                    good + [{'name': 'zakura-orchard', 'version': '1.1.0'}]]:
            with self.assertRaises(ValueError):
                audit_packages(bad, expected, ['orchard'])


if __name__ == '__main__':
    unittest.main()
