#!/usr/bin/env python3
"""Mutate private copies of the real frozen package; never fabricate receipts."""
import runpy,shutil,tempfile
from pathlib import Path
host=runpy.run_path(str(Path(__file__).with_name('quota-host.py')))
source=Path('/home/jack/zcash-browser-quota-scratch/package-1')
with tempfile.TemporaryDirectory(prefix='host-control-',dir=host['SCRATCH']) as tmp:
    root=Path(tmp)/'package';shutil.copytree(source,root)
    for p in root.rglob('*'): p.chmod(0o755 if p.is_dir() else 0o644)
    root.chmod(0o755)
    host['verify'](root)
    def rejected():
        try: host['verify'](root)
        except RuntimeError: return
        raise RuntimeError('tampered package accepted')
    module=root/'bundle/quota-suite.mjs';original=module.read_bytes()
    module.write_bytes(original+b'\n// mutation\n');rejected();module.write_bytes(original)
    extra=root/'bundle/unlisted.mjs';extra.write_text('');rejected();extra.unlink()
    module.unlink();rejected();module.write_bytes(original)
    extra.symlink_to(module);rejected();extra.unlink()
    host['verify'](root)
print('real package altered/missing/extra/symlink rejection controls pass')
