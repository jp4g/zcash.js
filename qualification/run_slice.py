"""Repeat the final bounded slice, keeping native/check/link gates distinct.

Run from the repository root after sourcing cargo-env.sh and
wasi-diagnostic-env.sh. The SDK must already be fetched and verified.
"""
import json
import os
from pathlib import Path
import sys

from harness import run

logs = Path('/home/jack/zcash-qualification-logs')
manifest = ['--locked', '--manifest-path', 'qualification/consumer/Cargo.toml']
target = ['--lib', '--target', 'wasm32-unknown-unknown']
sdk = Path('/home/jack/zcash-qualification-scratch/wasi-sdk-27.0-x86_64-linux')
if os.environ.get('CARGO_BUILD_JOBS') != '2' or os.environ.get('CC_wasm32_unknown_unknown') != str(sdk / 'bin/clang'):
    sys.exit('Source cargo-env.sh and wasi-diagnostic-env.sh before running this slice.')


def stage(label, argv):
    result = run(label, argv, logs)
    print(json.dumps(result), flush=True)
    return result


for label, command in [
    ('repeat-tests', ['python3', '-m', 'unittest', 'discover', '-s', 'qualification', '-p', 'test_harness.py']),
    ('repeat-sources', ['python3', 'qualification/verify_sources.py']),
    ('repeat-native', ['cargo', 'run', *manifest]),
]:
    result = stage(label, command)
    if result['exit_code']:
        sys.exit(result['exit_code'])

for platform in ['x86_64-unknown-linux-gnu', 'wasm32-unknown-unknown']:
    result = stage('repeat-metadata-' + platform,
                   ['cargo', 'metadata', *manifest, '--format-version', '1', '--filter-platform', platform])
    if result['exit_code']:
        sys.exit(result['exit_code'])
    result = stage('repeat-audit-' + platform, ['python3', 'qualification/audit.py', result['log']])
    if result['exit_code']:
        sys.exit(result['exit_code'])
    result = stage('repeat-features-' + platform, ['cargo', 'tree', *manifest, '-e', 'features', '--target', platform])
    if result['exit_code']:
        sys.exit(result['exit_code'])

result = stage('repeat-wasm-check', ['cargo', 'check', *manifest, *target])
if result['exit_code']:
    sys.exit(result['exit_code'])
linked = stage('repeat-wasm-link', ['cargo', 'build', *manifest, *target])
if linked['exit_code']:
    stage('repeat-wasm-libc-diagnostic', ['cargo', 'rustc', *manifest, *target, '--',
          '-C', 'link-arg=' + str(sdk / 'share/wasi-sysroot/lib/wasm32-wasi/libc.a'),
          '-C', 'link-arg=--error-limit=0'])
    print('Node/browser instantiation, module imports/memory, scanning, storage and threading: NOT QUALIFIED; final link failed.')
    sys.exit(linked['exit_code'])
print('Final link passed; runtime/import/memory qualification must still be executed separately.')
