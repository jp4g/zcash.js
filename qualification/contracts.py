"""Exact commands accepted by this bounded offline slice."""
PLATFORMS = ['x86_64-unknown-linux-gnu', 'wasm32-unknown-unknown']
MANIFEST = ['--offline', '--locked', '--manifest-path', 'qualification/consumer/Cargo.toml']
TARGET = ['--lib', '--target', PLATFORMS[1]]
SDK = '/home/jack/zcash-qualification-scratch/wasi-sdk-27.0-x86_64-linux'


def commands():
    result = {
        'repeat-tests': ['python3', '-m', 'unittest', 'discover', '-s', 'qualification', '-p', 'test*.py'],
        'repeat-sources': ['python3', 'qualification/verify_sources.py'],
        'repeat-native': ['cargo', 'run', *MANIFEST, '--message-format=json'],
    }
    for target in PLATFORMS:
        result['repeat-metadata-' + target] = ['cargo', 'metadata', *MANIFEST, '--format-version', '1', '--filter-platform', target]
        result['repeat-audit-' + target] = None  # The input is the producing metadata log.
        result['repeat-features-' + target] = ['cargo', 'tree', *MANIFEST, '-e', 'features', '--target', target]
    result['repeat-wasm-check'] = ['cargo', 'check', *MANIFEST, *TARGET, '--message-format=json']
    result['repeat-wasm-link'] = ['cargo', 'build', *MANIFEST, *TARGET, '--message-format=json']
    result['repeat-wasm-libc-diagnostic'] = ['cargo', 'rustc', *MANIFEST, *TARGET, '--message-format=json', '--', '-C', 'link-arg=' + SDK + '/share/wasi-sysroot/lib/wasm32-wasi/libc.a', '-C', 'link-arg=--error-limit=0']
    return result
