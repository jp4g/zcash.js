#!/usr/bin/env python3
"""Check locked archives, extracted sources and native patches before compilation."""
import hashlib
import json
from pathlib import Path
import runpy
import subprocess
import sys
import tarfile
import tempfile
import tomllib

source, scratch = map(Path, sys.argv[1:])
metadata = json.load(sys.stdin)
helpers = runpy.run_path(str(source / 'build-wallet.py'))
inventory, verify_package = helpers['inventory'], helpers['verify_package']
sha = lambda data: hashlib.sha256(data).hexdigest()
locked = {(p['name'], p['version']): p.get('checksum')
          for p in tomllib.loads((source / 'Cargo.lock').read_text())['package']}
policy = json.loads((source / 'native-policy/upstream.json').read_text())
packages = {}
for package in metadata['packages']:
    root = Path(package['manifest_path']).parent
    name, version = package['name'], package['version']
    if root == source:
        continue
    if name in policy and root.is_relative_to(source / 'native-policy/vendor'):
        # Reconstruct the patch from the locked archive, not a mutable receipt.
        cargo = Path(__import__('os').environ.get('CARGO_HOME', str(Path.home() / '.cargo')))
        archives = list((cargo / 'registry/cache').glob(f'*/{name}-{version}.crate'))
        if len(archives) != 1:
            raise RuntimeError(f'expected one policy archive: {name}')
        archive = archives[0]
        if sha(archive.read_bytes()) != policy[name]['checksum']:
            raise RuntimeError(f'policy archive checksum: {name}')
        with tempfile.TemporaryDirectory(prefix='verify-policy-', dir=scratch) as temporary:
            with tarfile.open(archive) as package_archive:
                package_archive.extractall(temporary, filter='data')
            expected_root = Path(temporary) / f'{name}-{version}'
            subprocess.run(['git', 'apply', str(source / 'native-policy' / f'{name}.patch')], cwd=expected_root, check=True)
            expected, actual = inventory(expected_root), inventory(root)
            for files in (expected, actual):
                files.pop('.cargo-ok', None)
                files.pop('.cargo-checksum.json', None)
            if expected != actual:
                raise RuntimeError(f'patched source differs from locked inputs: {name}')
        checksum = policy[name]['checksum']
    else:
        if package['source'] != 'registry+https://github.com/rust-lang/crates.io-index':
            raise RuntimeError(f'unexpected dependency source: {name}')
        checksum = locked[name, version]
        archive = root.parent.parent.parent / 'cache' / root.parent.name / f'{name}-{version}.crate'
        actual = verify_package(root, archive, checksum)
    packages[f'{name}@{version}'] = {'checksum': checksum,
        'sourceInventorySha256': sha(json.dumps(actual, sort_keys=True, separators=(',', ':')).encode())}
print(json.dumps(packages, sort_keys=True))
