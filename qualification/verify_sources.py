"""Compare retained evidence against actual fetched immutable source bytes."""
import hashlib
import json
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parent
scratch = Path('/home/jack/zcash-qualification-scratch')
wallet = scratch / 'wallet'
revision = subprocess.check_output(['git', '-C', str(wallet), 'rev-parse', 'HEAD'], text=True).strip()
if revision != 'a9142ee100b3a563b7d9ba7a8e94201d00ad8154':
    raise ValueError('wallet revision mismatch')
if subprocess.check_output(['git', '-C', str(wallet), 'status', '--porcelain']):
    raise ValueError('wallet checkout is dirty')
for retained, original in [('wallet-Cargo.lock', wallet / 'Cargo.lock'),
                           ('wallet-Cargo.toml', wallet / 'Cargo.toml'),
                           ('sources.toml', wallet / 'manifests/sources.toml'),
                           ('proofs-Cargo.toml', scratch / 'proofs-Cargo.toml')]:
    data = original.read_bytes()
    if data != (root / 'evidence' / retained).read_bytes():
        raise ValueError('retained source mismatch: ' + retained)
    print(json.dumps({'file': retained, 'sha256': hashlib.sha256(data).hexdigest(),
                      'comparison': 'exact fetched source bytes'}))
sdk = scratch / 'wasi-sdk-27.0-x86_64-linux.tar.gz'
digest = hashlib.sha256(sdk.read_bytes()).hexdigest()
if digest != 'b7d4d944c88503e4f21d84af07ac293e3440b1b6210bfd7fe78e0afd92c23bc2':
    raise ValueError('SDK archive checksum mismatch')
print(json.dumps({'file': sdk.name, 'sha256': digest, 'comparison': 'GitHub release asset digest'}))
