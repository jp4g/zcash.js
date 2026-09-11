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
