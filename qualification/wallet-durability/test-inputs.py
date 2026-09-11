#!/usr/bin/env python3
"""Fail closed on current-checkout inventory and bytes, including under -O."""
import importlib.util, json, shutil, subprocess, tempfile, sys
from pathlib import Path
sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('producer',Path(__file__).with_name('build.py'))
producer=importlib.util.module_from_spec(spec); spec.loader.exec_module(producer)
repo=Path(__file__).resolve().parents[2]
pins=json.loads(Path(__file__).with_name('inputs.json').read_text())
with tempfile.TemporaryDirectory() as temp:
    copy=Path(temp)
    (copy/'.git').write_text(f'gitdir: {subprocess.check_output(["git","rev-parse","--absolute-git-dir"],cwd=repo,text=True).strip()}\n')
    for label,pin in pins.items(): shutil.copytree(repo/pin['folder'],copy/pin['folder'])
    victim=copy/'qualification/scanner/src/lib.rs'; original=victim.read_bytes()
    cases={'missing':None,'altered':original+b'\n// drift\n','stale':subprocess.check_output(['git','show','e338313:qualification/scanner/src/lib.rs'],cwd=repo)}
    for case,content in cases.items():
        if content is None: victim.unlink()
        else: victim.write_bytes(content)
        try: producer.check_inputs(copy,pins)
        except RuntimeError as e: print(case,'rejected:',e)
        else: raise RuntimeError(f'{case} source accepted')
        victim.write_bytes(original)
    extra=victim.with_name('unexpected.rs');extra.write_text('// unexpected')
    try: producer.check_inputs(copy,pins)
    except RuntimeError as e: print('unexpected rejected:',e)
    else: raise RuntimeError('unexpected source accepted')
    extra.unlink()
    producer.check_inputs(copy,pins)
    print('valid current-checkout sources PASS')
