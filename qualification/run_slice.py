"""Repeat the final bounded slice, keeping native/check/link gates distinct.

Run from the repository root after sourcing cargo-env.sh and
wasi-diagnostic-env.sh. The SDK must already be fetched and verified.
"""
import json
import os
from pathlib import Path
import sys
import uuid

from harness import run

os.environ['QUALIFICATION_RUN_ID'] = uuid.uuid4().hex
print('Evidence run ID:', os.environ['QUALIFICATION_RUN_ID'], flush=True)

logs = Path('/home/jack/zcash-qualification-logs')
from contracts import commands, SDK
os.environ['CARGO_NET_OFFLINE'] = 'true'
os.environ['CARGO_TARGET_DIR'] = '/home/jack/zcash-qualification-scratch/cycle2-targets/' + os.environ['QUALIFICATION_RUN_ID']
if Path(os.environ['CARGO_TARGET_DIR']).exists():
    sys.exit('Run target directory already exists')
if os.environ.get('CARGO_BUILD_JOBS') != '2' or os.environ.get('CC_wasm32_unknown_unknown') != SDK + '/bin/clang':
    sys.exit('Source cargo-env.sh and wasi-diagnostic-env.sh before running this slice.')


def stage(label, argv):
    result = run(label, argv, logs)
    print(json.dumps(result), flush=True)
    return result


previous = None
for label, command in commands().items():
    if label == 'repeat-wasm-libc-diagnostic' and linked['exit_code'] == 0:
        break
    if command is None:
        command = ['python3', 'qualification/audit.py', previous['log'], label.removeprefix('repeat-audit-')]
    result = stage(label, command)
    if label == 'repeat-wasm-link':
        linked = result
    elif result['exit_code'] and label != 'repeat-wasm-libc-diagnostic':
        sys.exit(result['exit_code'])
    previous = result
print('Slice finished; runtime, storage, scanning and threading remain NOT QUALIFIED.')
sys.exit(linked['exit_code'])
