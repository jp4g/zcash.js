#!/usr/bin/env python3
"""External finite watchdog and command/output/source evidence; no network by default."""
import hashlib
import json
import os
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

def main():
    label, seconds, *cmd = sys.argv[1:]
    assert label.replace('-', '').replace('_', '').isalnum()
    env = dict(os.environ, CARGO_HOME=str(SCRATCH / 'cargo'),
               CARGO_TARGET_DIR=str(SCRATCH / 'target'), TMPDIR=str(SCRATCH / 'tmp'),
               CARGO_BUILD_JOBS='2', RAYON_NUM_THREADS='2')
    LOGS.mkdir(exist_ok=True)
    start = time.time()
    log = LOGS / f'{label}.log'
    assert not log.exists(), 'Evidence labels must be unique'
    with log.open('wb') as out:
        child = subprocess.Popen(cmd, cwd=ROOT, env=env, stdout=out,
                                 stderr=subprocess.STDOUT, start_new_session=True)
        try:
            rc = child.wait(timeout=float(seconds))
        except subprocess.TimeoutExpired:
            os.killpg(child.pid, signal.SIGKILL)
            child.wait()
            rc = 124
    record = dict(label=label, command=cmd, cwd=str(ROOT), deadline_seconds=float(seconds),
                  elapsed_seconds=time.time()-start, exit=rc, output_sha256=sha(log),
                  files={str(p.relative_to(ROOT)): sha(p) for p in sorted(ROOT.rglob('*'))
                         if p.is_file() and 'target' not in p.parts})
    with (LOGS / 'commands.jsonl').open('a') as out:
        out.write(json.dumps(record, sort_keys=True) + '\n')
    print(json.dumps({k: v for k, v in record.items() if k != 'files'}))
    print(log.read_text()[-6000:])
    return rc

if __name__ == '__main__':
    sys.exit(main())
