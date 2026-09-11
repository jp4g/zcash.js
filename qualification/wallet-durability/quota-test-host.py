#!/usr/bin/env python3
"""Mutate private copies of the real frozen package; never fabricate receipts."""
import runpy,shutil,sys,tempfile
from pathlib import Path
host=runpy.run_path(str(Path(__file__).with_name('quota-host.py')))
source=Path(sys.argv[1] if len(sys.argv)>1 else '/home/jack/zcash-browser-quota-scratch/package-1')
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

# Real Node preload and detached-process regressions, using private package copies.
import json,os,signal,subprocess
from unittest.mock import patch
with tempfile.TemporaryDirectory(prefix='host-lifecycle-',dir=host['SCRATCH']) as tmp:
    tmp=Path(tmp);g=host['run'].__globals__;g['LOGS']=tmp;g['SCRATCH']=tmp
    root=tmp/'package';shutil.copytree(source,root)
    for p in root.rglob('*'): p.chmod(0o755 if p.is_dir() else 0o644)
    root.chmod(0o755)
    marker=tmp/'preloaded';preload=tmp/'preload.cjs'
    preload.write_text(f"require('fs').writeFileSync({json.dumps(str(marker))}, 'unsafe');process.exit(91)")
    def runner(text):
        (root/'run-firefox.mjs').write_text(text)
        manifest=json.loads((root/'quota-manifest.json').read_text());manifest['files']=host['inventory'](root)
        (root/'quota-manifest.json').write_text(json.dumps(manifest))
        return host['digest'](root/'quota-manifest.json')
    pin=runner("if (Object.keys(process.env).some(k=>/^(NODE_OPTIONS|LD_PRELOAD|MOZ_DISABLE_CONTENT_SANDBOX)$/.test(k))) process.exit(92);")
    with patch.dict(os.environ,NODE_OPTIONS='--require='+str(preload),LD_PRELOAD='/nonexistent/inert-control',MOZ_DISABLE_CONTENT_SANDBOX='INERT_ONLY'):
        rc=host['run'](root,pin)
    if marker.exists() or rc!=0: raise RuntimeError('ambient execution/policy environment reached Node')
    print('real Node preload and browser override environment control passes')
    real_wait=subprocess.Popen.wait
    for scenario in ['interrupt','timeout']:
        pids=tmp/(scenario+'-pids')
        pin=runner("import {spawn} from 'node:child_process';import fs from 'node:fs';"
            "process.on('SIGTERM',()=>{});const child=spawn(process.execPath,['-e',"
            "'process.on(\"SIGTERM\",()=>{});setInterval(()=>{},1000)'],{detached:true,stdio:'ignore'});"
            f"fs.writeFileSync({json.dumps(str(pids))},JSON.stringify([process.pid,child.pid]));setInterval(()=>{{}},1000);")
        def wait(child,timeout=None):
            if timeout==215:
                import time
                deadline=time.monotonic()+5
                while not pids.exists() and time.monotonic()<deadline: time.sleep(.01)
                if not pids.exists(): raise RuntimeError('control Node failed to start')
                if scenario=='interrupt': raise KeyboardInterrupt()
                raise subprocess.TimeoutExpired(child.args,timeout)
            return real_wait(child,timeout=.1 if timeout==25 else timeout)
        with patch.object(subprocess.Popen,'wait',wait): rc=host['run'](root,pin)
        attempt=max(tmp.glob('host-*'),key=lambda p:p.name)
        result=json.loads((attempt/'exit.json').read_text())
        if rc not in [124,130] or not result['profileParentRemoved']: raise RuntimeError('failure cleanup/status missing')
        for pid in json.loads(pids.read_text()):
            try: os.kill(pid,0)
            except ProcessLookupError: continue
            os.kill(pid,signal.SIGKILL)
            raise RuntimeError('owned Node/detached group survived cleanup')
        print(scenario+' real Node and detached group killed/joined before profile removal')

    pin=runner('')
    with patch.dict(host['run'].__globals__,cleanup_owned=lambda child:False):
        rc=host['run'](root,pin)
    attempt=max(tmp.glob('host-*'),key=lambda p:p.name)
    result=json.loads((attempt/'exit.json').read_text())
    if rc==0 or result['profileParentRemoved'] or result['cleanupComplete']:
        raise RuntimeError('uncertain cleanup removed profile or passed')
    print('uncertain cleanup records failure and preserves profile')
