#!/usr/bin/env python3
"""Freeze a quota overlay; run the accepted Firefox lifecycle with one profile pref."""
import hashlib,json,os,shutil,subprocess,sys,time
from pathlib import Path

ACCEPTED=Path('/home/jack/zcash-wallet-integrated-scratch/stage-4')
PIN='cd8a03d9f5c661e0380ac9514c8a1ab90e9dce61691856c35de0a6e22295853c'
SCRATCH=Path('/home/jack/zcash-browser-quota-scratch')
LOGS=Path('/home/jack/zcash-browser-quota-logs')
HERE=Path(__file__).resolve().parent

def digest(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def inventory(root):
    if any(p.is_symlink() for p in root.rglob('*')): raise RuntimeError('symlinks forbidden in package')
    return {str(p.relative_to(root)):{'sha256':digest(p),'bytes':p.stat().st_size} for p in root.rglob('*') if p.is_file() and p!=root/'quota-manifest.json'}
def replace(raw,old,new):
    if raw.count(old)!=1: raise RuntimeError('accepted seam changed: '+old)
    return raw.replace(old,new)
def verify(root):
    manifest=json.loads((root/'quota-manifest.json').read_text())
    if manifest['acceptedManifest']!=PIN or digest(ACCEPTED/'provenance.json')!=PIN: raise RuntimeError('accepted manifest drift')
    if inventory(root)!=manifest['files']: raise RuntimeError('frozen quota package drift')
    return manifest

def freeze(root):
    if root.parent!=SCRATCH: raise RuntimeError('package must be directly beneath owned scratch')
    if digest(ACCEPTED/'provenance.json')!=PIN: raise RuntimeError('accepted manifest mismatch')
    provenance=json.loads((ACCEPTED/'provenance.json').read_text())
    expected={k:v for k,v in provenance['artifacts'].items() if not k.startswith('raw/')}
    if inventory(ACCEPTED/'bundle')!=expected: raise RuntimeError('accepted bundle drift')
    root.mkdir()
    shutil.copytree(ACCEPTED/'bundle',root/'bundle')
    for p in HERE.glob('quota-*'):
        if p.is_file(): shutil.copyfile(p,root/p.name)
    for name in ['quota-suite.mjs','quota-worker.mjs','quota-pressure.mjs']:
        shutil.copyfile(HERE/name,root/'bundle'/name)
    browser=(root/'bundle/browser-test.mjs').read_text()
    browser=replace(browser,"from './suite.mjs'","from './quota-suite.mjs'")
    browser=replace(browser,"new Worker('./browser-worker.mjs'","new Worker('./quota-worker.mjs'")
    browser="import {errorDetails} from './quota-pressure.mjs';\n"+browser
    browser=replace(browser,'error:String(e.stack)','...errorDetails(e)')
    browser=replace(browser,'actualQuotaExhaustion:false','actualQuotaExhaustion:results.some(r=>r.test===\'actual-quota-populated-scan-rollback-retry\' && r.pass===true)')
    (root/'bundle/browser-test.mjs').write_text(browser)
    # No alternative server/driver lifecycle: exact pinned runner plus narrow seams.
    runner=HERE.parent/'storage/run-firefox.mjs'
    static=HERE.parent/'storage/serve-static.mjs'
    for p in [runner,static]:
        if digest(p)!=provenance['inputs']['storage/'+p.name]['sha256']: raise RuntimeError('runner/static input mismatch')
    raw=runner.read_text()
    raw=replace(raw,"args: ['-headless']","args: ['-headless'], prefs: {'dom.quotaManager.temporaryStorage.fixedLimit': 32768}")
    raw=replace(raw,"'--websocket-port', '0'","'--websocket-port', '0', '--profile-root', process.env.QUOTA_PROFILE_ROOT")
    raw=replace(raw,'serveStatic(base, req, res);','serveStatic(base, req, res, events);')
    raw=replace(raw,'let driver, session, browserPid, socket,','let capabilities, driver, session, browserPid, socket,')
    raw=replace(raw,'session = value.sessionId;','capabilities = value.capabilities; session = value.sessionId;')
    raw=replace(raw,'result.lifecycle = lifecycle;','result.lifecycle = lifecycle; result.browserCapabilities = capabilities;')
    (root/'run-firefox.mjs').write_text(raw)
    shutil.copyfile(static,root/'original-static.mjs')
    (root/'serve-static.mjs').write_text("""import {serveStatic as original} from './original-static.mjs';
export function serveStatic(base,req,res,events) {
  if(req.url==='/wallet-phase' || req.url==='/wallet-realms') {
    const created=events.filter(e=>e.method==='script.realmCreated' && e.params.type==='dedicated-worker').map(e=>e.params.realm);
    const destroyed=events.filter(e=>e.method==='script.realmDestroyed').map(e=>e.params.realm);
    res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
    res.end(JSON.stringify(req.url==='/wallet-phase'?{phase:'all'}:{created,destroyed}));return;
  }
  original(base,req,res);
}
""")
    manifest={'acceptedManifest':PIN,'acceptedBundle':str(ACCEPTED/'bundle'),'runner':digest(runner),'static':digest(static),'fixedLimitKiB':32768,'fillerCapBytes':67108864,'files':inventory(root)}
    (root/'quota-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    verify(root)
    for p in root.rglob('*'): p.chmod(0o555 if p.is_dir() else 0o444)
    root.chmod(0o555)
    print(json.dumps({'package':str(root),'manifestSha256':digest(root/'quota-manifest.json')}))

def run(root,expected):
    if digest(root/'quota-manifest.json')!=expected: raise RuntimeError('explicit quota manifest mismatch')
    manifest=verify(root)
    attempt=LOGS/f'host-{time.time_ns()}';attempt.mkdir()
    owned=SCRATCH/f'run-{time.time_ns()}';owned.mkdir();profiles=owned/'profiles';profiles.mkdir()
    env=dict(os.environ,STORAGE_BUNDLE=str(root/'bundle'),STORAGE_LOG_DIR=str(attempt),STORAGE_DRIVER_PORT='19465',QUOTA_PROFILE_ROOT=str(profiles))
    receipt={'package':str(root),'manifestSha256':expected,'manifest':manifest,'profiles':str(profiles),'command':['node',str(root/'run-firefox.mjs')],'node':subprocess.check_output(['node','--version'],text=True).strip()}
    (attempt/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
    print('Quota host attempt: '+str(attempt),flush=True)
    try:
        with (attempt/'console.log').open('x') as log:
            child=subprocess.Popen(receipt['command'],env=env,stdout=log,stderr=subprocess.STDOUT)
            try: rc=child.wait(timeout=215)
            except subprocess.TimeoutExpired:
                child.terminate()
                try: child.wait(timeout=25)
                except subprocess.TimeoutExpired: child.kill();child.wait()
                rc=124
    finally:
        shutil.rmtree(owned)
    (attempt/'exit.json').write_text(json.dumps({'exitCode':rc,'profileParentRemoved':not owned.exists()})+'\n')
    print(json.dumps({'exitCode':rc,'logs':str(attempt)}))
    return rc

if __name__=='__main__':
    action=sys.argv[1];root=Path(sys.argv[2]).resolve()
    if action=='freeze': freeze(root)
    elif action=='verify': verify(root);print('quota package verified')
    elif action=='run': raise SystemExit(run(root,sys.argv[3]))
    else: raise RuntimeError('expected freeze, verify or run')
