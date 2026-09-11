import json
import os
import platform
import subprocess

commands = [['rustc', '-Vv'], ['cargo', '-V'], ['rustup', 'target', 'list', '--installed'],
            ['cc', '--version'], ['node', '--version'], ['git', '--version']]
for command in commands:
    result = subprocess.run(command, text=True, capture_output=True)
    print(json.dumps(dict(argv=command, exit_code=result.returncode, stdout=result.stdout, stderr=result.stderr)))
print(json.dumps({'platform': platform.platform(), 'environment': {
    k: os.environ.get(k) for k in ['CARGO_HOME', 'CARGO_TARGET_DIR', 'CARGO_BUILD_JOBS',
                                 'RUSTFLAGS', 'CC', 'CFLAGS', 'CARGO_NET_RETRY', 'CARGO_HTTP_TIMEOUT']}}))
