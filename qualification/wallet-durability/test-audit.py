#!/usr/bin/env python3
"""Exercise the complete audit with isolated source mutations and real generation."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path('/home/jack/zcash-wallet-durability-scratch')
OWNED = Path('/home/jack/zcash-wallet-durability-fix-scratch')
REGISTRY = Path('cargo/registry/src/index.crates.io-1949cf8c6b5b557f')
PACKAGES = ['zakura-client-backend-0.1.0-rc4', 'zakura-client-sqlite-0.1.0-rc4', 'zakura-pczt-0.1.0-rc2']


class AuditInventoryTests(unittest.TestCase):
    def test_inventories(self):
        OWNED.mkdir(exist_ok=True)
        for optimized in (False, True):
            for case in ('missing_all', 'missing_package', 'missing_file', 'unexpected_file', 'modified_bytes', 'valid'):
                with self.subTest(optimized=optimized, case=case):
                    with tempfile.TemporaryDirectory(prefix='audit-test-', dir=OWNED) as temporary:
                        root = Path(temporary)
                        stage = root / 'stage-7'
                        stage.mkdir()
                        for entry in (ROOT / 'stage-7').iterdir():
                            (stage / entry.name).symlink_to(entry, target_is_directory=entry.is_dir())
                        registry = root / REGISTRY
                        registry.mkdir(parents=True)
                        (registry / 'libsqlite3-sys-0.35.0').symlink_to(ROOT / REGISTRY / 'libsqlite3-sys-0.35.0', target_is_directory=True)
                        for package in PACKAGES:
                            shutil.copytree(ROOT / REGISTRY / package / 'src', registry / package / 'src')
                        victim = next((registry / PACKAGES[0] / 'src').rglob('*.rs'))
                        if case == 'missing_all':
                            for package in PACKAGES:
                                shutil.rmtree(registry / package)
                        elif case == 'missing_package':
                            shutil.rmtree(registry / PACKAGES[1])
                        elif case == 'missing_file':
                            victim.unlink()
                        elif case == 'unexpected_file':
                            (registry / PACKAGES[0] / 'src/unexpected.rs').write_text('// unexpected\n')
                        elif case == 'modified_bytes':
                            victim.write_bytes(victim.read_bytes() + b'\n// changed\n')
                        source = Path(__file__).with_name('audit.py').read_text()
                        original = "scratch=Path('/home/jack/zcash-wallet-durability-scratch')"
                        self.assertEqual(source.count(original), 1)
                        script = root / 'audit.py'
                        script.write_text(source.replace(original, f'scratch=Path({str(root)!r})'))
                        command = [sys.executable] + (['-O'] if optimized else []) + [str(script), str(stage)]
                        result = subprocess.run(command, capture_output=True, text=True, env={**os.environ, 'PYTHONDONTWRITEBYTECODE': '1', 'TMPDIR': str(root)}, timeout=120)
                        if case == 'valid':
                            self.assertEqual(result.returncode, 0, result.stderr)
                            receipt = json.loads(result.stdout)
                            self.assertTrue(receipt['pass'])
                            self.assertEqual(receipt['wallet_git_source_files_checked'], 180)
                            self.assertEqual(len(receipt['regenerated_byte_identical']), 4)
                        else:
                            self.assertNotEqual(result.returncode, 0, result.stdout)
                            self.assertIn('wallet source', result.stderr)


if __name__ == '__main__':
    unittest.main(verbosity=2)
