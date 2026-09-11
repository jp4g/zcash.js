"""Synthetic input-binding controls, not runtime acceptance."""
import hashlib
import unittest
from inspection_inputs import verify_pair, inspect_bytes

class Inputs(unittest.TestCase):
    def test_pair_rejects_either_changed_input(self):
        wasm, link_map = b'wasm-a', b'map-a'
        hashes = tuple(hashlib.sha256(x).hexdigest() for x in (wasm, link_map))
        verify_pair(wasm, link_map, hashes)
        for pair in [(b'wasm-b', link_map), (wasm, b'map-b')]:
            with self.assertRaises(ValueError):
                verify_pair(*pair, hashes)

    def test_regeneration_uses_selected_bytes(self):
        empty = b'\0asm\x01\0\0\0'
        # Same function count, different import name.
        def module(name):
            return empty + bytes([1,4,1,96,0,0,2,7,1,1,120,1,ord(name),0,0])
        for name in ('a', 'b'):
            imports, disassembly = inspect_bytes(module(name))
            self.assertEqual(imports, [dict(module='x', name=name, kind='function')])
            self.assertIn('file format wasm', disassembly)

if __name__ == '__main__':
    unittest.main()
