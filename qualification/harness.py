"""Disposable qualification command recorder; never interprets a failed stage as evidence."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import time

from fingerprints import sources, producer_artifacts, messages


def run(label, argv, logs, timeout=900, cwd=None, env=None):
    effective = os.environ if env is None else env
    run_id = effective.get('QUALIFICATION_RUN_ID')
    before = sources() if run_id else None
    target_existed = Path(effective.get('CARGO_TARGET_DIR', '.')).exists()
    logs = Path(logs).resolve()
    logs.mkdir(parents=True, exist_ok=True)
    path = logs / f'{label}-{time.time_ns()}.log'
    started = datetime.now(timezone.utc).isoformat()
    timed_out = False
    with path.open('xb') as output:
        process = subprocess.Popen(argv, cwd=cwd, env=env, stdout=output,
                                   stderr=subprocess.STDOUT, start_new_session=True)
        try:
            code = process.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait()
            code, timed_out = 124, True
    record = dict(label=label, argv=argv, cwd=str(Path(cwd or os.getcwd()).resolve()),
                  started=started, exit_code=code, timed_out=timed_out,
                  timeout_seconds=timeout, log=str(path),
                  sha256=hashlib.sha256(path.read_bytes()).hexdigest())
    effective = os.environ if env is None else env
    record['environment'] = {k: effective.get(k) for k in [
        'CARGO_HOME', 'CARGO_TARGET_DIR', 'CARGO_BUILD_JOBS', 'CARGO_NET_RETRY',
        'CARGO_HTTP_TIMEOUT', 'RUSTFLAGS', 'RUSTUP_TOOLCHAIN',
        'CC_wasm32_unknown_unknown', 'AR_wasm32_unknown_unknown',
        'CFLAGS_wasm32_unknown_unknown', 'CC_ENABLE_DEBUG_OUTPUT']}
    if run_id:
        record.update(run_id=run_id, sources_before=before, sources_after=sources(),
                      target_existed_before=target_existed)
        record['artifacts_after'] = producer_artifacts(record, messages(path))
    with (logs / 'commands.jsonl').open('a') as output:
        output.write(json.dumps(record, sort_keys=True) + '\n')
    return record


def audit_packages(packages, expected, forbidden):
    found = {}
    for package in packages:
        name, version = package['name'], package['version']
        if name in forbidden:
            raise ValueError(f'forbidden upstream package: {name}')
        if name.startswith('zakura-'):
            if name not in expected or expected[name] != version or name in found:
                raise ValueError(f'unexpected/duplicate Zakura identity: {name} {version}')
            found[name] = version
    if found != expected:
        raise ValueError(f'missing Zakura packages: {sorted(expected.keys() - found.keys())}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--logs', default='/home/jack/zcash-qualification-logs')
    parser.add_argument('--timeout', type=float, default=900)
    parser.add_argument('label')
    parser.add_argument('command', nargs=argparse.REMAINDER)
    args = parser.parse_args()
    result = run(args.label, args.command, args.logs, args.timeout)
    print(json.dumps(result, sort_keys=True))
    raise SystemExit(result['exit_code'])
