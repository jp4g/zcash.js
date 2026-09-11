"""Reject changed preserved raw/generated/source inputs, not runtime proof."""
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from inspection_inputs import verify_bundle

class BundleInputs(unittest.TestCase):
    def test_rejects_each_mutated_member_and_source_change(self):
        with tempfile.TemporaryDirectory() as temp:
            stage = Path(temp)
            names = ['raw/module.wasm', 'raw/runtime.map', 'web/qualification_bg.wasm', 'sources/adapter.c']
            for name in names:
                p = stage / name
                p.parent.mkdir(exist_ok=True)
                p.write_bytes(name.encode())
            record = dict(sources_before={'adapter.c':'identity'}, sources_after={'adapter.c':'identity'},
                          artifacts={name:hashlib.sha256((stage/name).read_bytes()).hexdigest() for name in names})
            (stage/'provenance.json').write_text(json.dumps(record))
            verify_bundle(stage)
            for name in names:
                p = stage/name
                original = p.read_bytes()
                p.write_bytes(b'changed')
                with self.assertRaises(ValueError): verify_bundle(stage)
                p.write_bytes(original)
            record['sources_after']['adapter.c'] = 'changed'
            (stage/'provenance.json').write_text(json.dumps(record))
            with self.assertRaises(ValueError): verify_bundle(stage)

if __name__ == '__main__': unittest.main()
