#!/usr/bin/env python3
"""Exercise the actual host wrapper without starting Node or opening sockets.

Run with python3 and python3 -O; pass a qualified stage directory.
"""
import json
import os
from pathlib import Path
import runpy
import shutil
import sys
import tempfile
sys.dont_write_bytecode = True
# The adjacent qualification inspect.py is not the standard library module.
if str(Path(__file__).resolve().parent) in sys.path:
    sys.path.remove(str(Path(__file__).resolve().parent))
import unittest
from unittest.mock import patch

if len(sys.argv) != 2:
    raise SystemExit('usage: test-host.py STAGE')
STAGE = Path(sys.argv.pop(1)).resolve()
HOST = Path(__file__).with_name('run-host.py').resolve()
RUNNER = HOST.parents[1] / 'storage/run-firefox.mjs'
PIN = json.loads(HOST.with_name('inputs.json').read_text())['storage']['files']['run-firefox.mjs']


class HostPathTest(unittest.TestCase):
    def test_bundle_path(self):
        with tempfile.TemporaryDirectory(prefix='host-path-') as temporary:
            stage = Path(temporary)
            (stage / 'source').mkdir()
            shutil.copyfile(HOST, stage / 'source/run-host.py')
            shutil.copyfile(STAGE / 'provenance.json', stage / 'provenance.json')
            shutil.copytree(STAGE / 'bundle', stage / 'bundle')
            (stage / 'alias').symlink_to(stage / 'bundle', target_is_directory=True)
            for name in ['source', 'missing', 'bundle', 'alias']:
                with self.subTest(requested=name):
                    scratch = stage / ('scratch-' + name)
                    scratch.mkdir()
                    requested = os.path.relpath(stage / name)
                    with patch.dict(os.environ, STORAGE_BUNDLE=requested,
                                    WD_SCRATCH=str(scratch), STORAGE_LOG_DIR=str(scratch)), \
                         patch.object(sys, 'argv', [str(HOST), str(RUNNER), PIN]), \
                         patch('subprocess.call', return_value=0) as launch:
                        if name in ['source', 'missing']:
                            with self.assertRaisesRegex(RuntimeError, 'STORAGE_BUNDLE must resolve to stage/bundle'):
                                runpy.run_path(str(HOST), run_name='__main__')
                            launch.assert_not_called()
                        else:
                            with self.assertRaises(SystemExit) as result:
                                runpy.run_path(str(HOST), run_name='__main__')
                            self.assertEqual(result.exception.code, 0)
                            launch.assert_called_once()
                            forwarded = launch.call_args.kwargs['env']['STORAGE_BUNDLE']
                            receipt = json.loads(next(scratch.glob('host-runner-*/receipt.json')).read_text())
                            self.assertEqual(forwarded, str(stage / 'bundle'))
                            self.assertEqual(receipt['bundle'], forwarded)


if __name__ == '__main__':
    unittest.main()
