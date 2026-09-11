"""Inspect the actual failed link and artifacts without fabricating an instance."""
import json
from pathlib import Path
import re

records = [json.loads(line) for line in Path('/home/jack/zcash-qualification-logs/commands.jsonl').read_text().splitlines()]
for label in ['repeat-wasm-link', 'repeat-wasm-libc-diagnostic']:
    record = next(r for r in reversed(records) if r['label'] == label)
    log = Path(record['log']).read_text()
    print(json.dumps({'label': label, 'exit_code': record['exit_code'],
                      'reported_undefined_symbols': sorted(set(re.findall(r'undefined symbol: (\w+)', log)))}))
target = Path('/home/jack/zcash-qualification-scratch/target/wasm32-unknown-unknown/debug')
for path in [target / 'issue_2_qualification.wasm', target / 'deps/issue_2_qualification.wasm']:
    print(json.dumps({'path': str(path), 'exists': path.exists()}))
