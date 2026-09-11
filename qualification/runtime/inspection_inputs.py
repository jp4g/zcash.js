"""Bind historical link-map provenance and regenerate byte-derived evidence."""
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile

# Explicit preserved link identities, never selection by latest-log label.
# Historical pair was independently reviewed; review-fix pair is captured from
# the recorded offline build (see review-fix.md), pending HIGH review.
HISTORICAL_PAIR = (
    '606a000bbb8dc51868e41d0d832285c7499862d64a2514b4110e73682ff8cecd',
    '4b84176c323095479688f2464e35a8340c89b1edd5b6318b0d54648a6aa13901',
)
LINK_PAIRS = {
    'adapter-link': HISTORICAL_PAIR,
    'review-fix-link': (
        '15a9b851e8dcd4d1855f9a9a697b35045148841db5ebcc5fc9417f5233e7519a',
        '57ba35ac05385715be8a99f430e514082abbee024f85e8353c1a75895857429b',
    ),
}
OBJDUMP = '/home/jack/zcash-qualification-scratch/wasi-sdk-27.0-x86_64-linux/bin/llvm-objdump'

def verify_pair(raw, link_map, expected=HISTORICAL_PAIR):
    actual = tuple(hashlib.sha256(x).hexdigest() for x in (raw, link_map))
    if actual != expected:
        raise ValueError('unverified artifact/link-map identity')

def inspect_bytes(raw):
    # Both tools consume the same private snapshot, never mutable target output
    # or independently selected command logs. No instantiation/transformation.
    with tempfile.TemporaryDirectory(dir='/home/jack/zcash-node-runtime-scratch') as directory:
        snapshot = Path(directory) / 'selected.wasm'
        snapshot.write_bytes(raw)
        imports = subprocess.run(['node', '-e',
            'const fs=require("fs"); console.log(JSON.stringify(WebAssembly.Module.imports(new WebAssembly.Module(fs.readFileSync(process.argv[1])))))',
            str(snapshot)], check=True, capture_output=True, text=True, timeout=60)
        disassembly = subprocess.run([OBJDUMP, '-d', str(snapshot)],
            check=True, capture_output=True, text=True, timeout=60)
        return json.loads(imports.stdout), disassembly.stdout
