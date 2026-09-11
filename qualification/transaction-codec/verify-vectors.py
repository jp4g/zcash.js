"""Verify this fixed corpus against the pinned local sources; no fetching or generation."""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tomllib

ROOT = Path(__file__).resolve().parent
provenance = json.loads((ROOT / 'fixtures/provenance.json').read_text())
COMMON = Path('/home/jack/zcash-transaction-codec-scratch/cargo/registry/src/index.crates.io-1949cf8c6b5b557f/zakura-primitives-1.0.0')
COMMON_FILES = ['Cargo.toml', '.cargo_vcs_info.json', 'src/transaction/mod.rs',
                'src/transaction/txid.rs', 'src/transaction/tests.rs', 'src/transaction/tests/data.rs']
SCANNER_FILES = ['qualification/scanner/src/tests.rs', 'qualification/scanner/fixtures/manifest.json',
                 'qualification/scanner/fixtures/transparent-reference.json',
                 'qualification/scanner/fixtures/transparent-spend.bin']
if set(provenance['sources']) != {str(COMMON / name) for name in COMMON_FILES} | set(SCANNER_FILES):
    raise ValueError('expected exact source inventory')
package = tomllib.loads((COMMON / 'Cargo.toml').read_text())['package']
vcs = json.loads((COMMON / '.cargo_vcs_info.json').read_text())
if provenance['common_version'] != package['version'] or package['version'] != '1.0.0':
    raise ValueError('Common version mismatch')
if (provenance['common_revision'] != vcs['git']['sha1']
        or vcs['git']['sha1'] != 'f4526b0fa86406589732c8fb3849855fb92c43a2'):
    raise ValueError('Common revision mismatch')
if provenance['scanner_revision'] != 'fd9b3e3':
    raise ValueError('scanner revision mismatch')
for name in SCANNER_FILES:
    pinned = subprocess.check_output(['git', 'show',
        'fd9b3e3ee2e815ebb16c151e27a85a8021f44550:' + name], cwd=ROOT.parents[1])
    if pinned != (ROOT.parents[1] / name).read_bytes():
        raise ValueError(f'scanner source differs from pinned revision: {name}')
vectors_bytes = (ROOT / 'fixtures/vectors.json').read_bytes()
digest = lambda raw: hashlib.sha256(raw).hexdigest()
if digest(vectors_bytes) != provenance['vectors_sha256']:
    raise ValueError('vector file changed')
for name, expected in provenance['sources'].items():
    path = Path(name) if Path(name).is_absolute() else ROOT.parents[1] / name
    if digest(path.read_bytes()) != expected:
        raise ValueError(f'changed source: {path}')
data_path = next(name for name in provenance['sources'] if name.endswith('/tests/data.rs'))
source = Path(data_path).read_text()
vectors = json.loads(vectors_bytes)
if len(vectors) != 13 or len({v['name'] for v in vectors}) != 13:
    raise ValueError('expected exact 13-vector corpus')
hex_bytes = lambda text: bytes(int(x, 16) for x in re.findall(r'0x([0-9a-f]{2})', text))
index = 0
for module, indices, branch in [('zip_0143', [0], 0x5ba81b19), ('zip_0243', [4], 0x76b809bb),
                                ('zip_0244', range(10), 0xc2d6d0b4)]:
    section = source.split('pub mod ' + module + ' {', 1)[1].split('\npub mod ', 1)[0]
    records = re.split(r'Test(?:0143|0243)?Vector \{', section)[2:]
    for i in indices:
        record = records[i]
        raw = hex_bytes(re.search(r'\btx: vec!\[(.*?)\]', record, re.S)[1])
        txid = (hex_bytes(re.search(r'\btxid: \[(.*?)\]', record, re.S)[1]) if module == 'zip_0244'
                else hashlib.sha256(hashlib.sha256(raw).digest()).digest())
        expected = {'name': f'{module}-{i}', 'hex': raw.hex(), 'txid': txid.hex(),
                    'display': txid[::-1].hex(), 'branch': branch, 'sha256': digest(raw),
                    'version': int.from_bytes(raw[:4], 'little') & 0x7fffffff}
        if any(vectors[index][key] != value for key, value in expected.items()):
            raise ValueError(f'ZIP vector mismatch: {module}-{i}')
        index += 1
scanner = ROOT.parent / 'scanner/fixtures'
manifest = json.loads((scanner / 'manifest.json').read_text())
for name in ['transparent-spend.bin', 'transparent-reference.json']:
    raw = (scanner / name).read_bytes()
    if manifest['files'][name] != {'sha256': digest(raw), 'bytes': len(raw)}:
        raise ValueError('scanner manifest mismatch')
raw = (scanner / 'transparent-spend.bin').read_bytes()
rows = [row for row in json.loads((scanner / 'transparent-reference.json').read_text())['transactions']
        if 'b:' + raw.hex() in row]
if len(rows) != 1:
    raise ValueError('expected unique raw transaction reference')
txid = bytes.fromhex(rows[0][1][2:])
expected = {'name': 'scanner-v6-transparent', 'hex': raw.hex(), 'txid': txid.hex(),
            'display': txid[::-1].hex(), 'branch': 0x37a5165b, 'version': 6, 'sha256': digest(raw)}
if any(vectors[-1][key] != value for key, value in expected.items()):
    raise ValueError('scanner vector mismatch')
print('Verified 13 exact source-backed vectors, provenance hashes, branch contexts, and expected txid order.')
