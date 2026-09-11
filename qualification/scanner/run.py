#!/usr/bin/env python3
"""External finite watchdog and command/output/source evidence; no network by default."""
import hashlib
import json
import math
import os
import re
from pathlib import Path
import signal
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parent
LOGS = Path('/home/jack/zcash-scanner-logs')
SCRATCH = Path('/home/jack/zcash-scanner-scratch')

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def inventory():
    return {str(p.relative_to(ROOT)): sha(p) for p in sorted(ROOT.rglob('*'))
            if p.is_file() and 'target' not in p.parts}

def main():
    label, seconds, *cmd = sys.argv[1:]
    if not re.fullmatch(r'[a-zA-Z0-9_-]+', label):
        raise ValueError('Invalid evidence label')
    deadline = float(seconds)
    if not math.isfinite(deadline) or deadline <= 0 or not cmd:
        raise ValueError('A finite positive deadline and command are required')
    env = dict(os.environ, CARGO_HOME=str(SCRATCH / 'cargo'),
               CARGO_TARGET_DIR=str(SCRATCH / 'target'), TMPDIR=str(SCRATCH / 'tmp'),
               CARGO_BUILD_JOBS='2', RAYON_NUM_THREADS='2')
    LOGS.mkdir(exist_ok=True)
    inputs = inventory()
    start = time.time()
    log = LOGS / f'{label}.log'
    with log.open('xb') as out:
        child = subprocess.Popen(cmd, cwd=ROOT, env=env, stdout=out,
                                 stderr=subprocess.STDOUT, start_new_session=True)
        try:
            rc = child.wait(timeout=deadline)
        except subprocess.TimeoutExpired:
            os.killpg(child.pid, signal.SIGKILL)
            child.wait()
            rc = 124
    record = dict(label=label, command=cmd, cwd=str(ROOT), deadline_seconds=float(seconds),
                  elapsed_seconds=time.time()-start, exit=rc, output_sha256=sha(log),
                  inputs=inputs, files=inventory(),
                  environment={k: env.get(k) for k in ['CARGO_HOME', 'CARGO_TARGET_DIR', 'TMPDIR',
                    'CARGO_BUILD_JOBS', 'RAYON_NUM_THREADS', 'RUSTFLAGS', 'CARGO_ENCODED_RUSTFLAGS',
                    'PYTHONOPTIMIZE', 'SCANNER_FREEZE', 'SCANNER_EXT_CAPTURE']})
    with (LOGS / 'commands.jsonl').open('a') as out:
        out.write(json.dumps(record, sort_keys=True) + '\n')
    print(json.dumps({k: v for k, v in record.items() if k not in ['files', 'inputs']}))
    print(log.read_text()[-6000:])
    return rc

if __name__ == '__main__':
    sys.exit(main())
