#!/usr/bin/env python3
"""Freeze a quota overlay; run the accepted Firefox lifecycle with one profile pref."""
import ctypes,hashlib,json,os,shutil,signal,subprocess,sys,time
from pathlib import Path

ACCEPTED=Path('/home/jack/zcash-wallet-integrated-scratch/stage-4')
PIN='cd8a03d9f5c661e0380ac9514c8a1ab90e9dce61691856c35de0a6e22295853c'
SCRATCH=Path('/home/jack/zcash-browser-quota-scratch')
LOGS=Path('/home/jack/zcash-browser-quota-logs/fixes')
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
    browser=replace(browser,'const {phase}=','const {phase,quotaConfig}=')
    browser=replace(browser,'await suite({reference,phase,root:','await suite({reference,phase,quotaConfig,barriers,root:')
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
    res.end(JSON.stringify(req.url==='/wallet-phase'?{phase:'all',quotaConfig:{fixedLimitKiB:32768}}:{created,destroyed}));return;
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

def children():
    # Linux subreaper adoption keeps detached descendants owned and waitable.
    return [int(pid) for pid in Path(f'/proc/self/task/{os.getpid()}/children').read_text().split()]

def cleanup_owned(child):
    try:
        if child is not None and child.poll() is None:
            child.terminate()
            try: child.wait(timeout=25)
            except subprocess.TimeoutExpired: child.kill();child.wait(timeout=5)
        deadline=time.monotonic()+5
        while children():
            for pid in children():
                # An unreaped direct child cannot have its PID reused. Only
                # signal a group when this owned child is its group leader.
                try:
                    os.killpg(pid,signal.SIGKILL) if os.getpgid(pid)==pid else os.kill(pid,signal.SIGKILL)
                except ProcessLookupError: pass
                os.waitpid(pid,os.WNOHANG)
            if time.monotonic()>=deadline: return False
            time.sleep(.02)
        return True
    except Exception as e:
        print('owned cleanup failed: '+repr(e),flush=True)
        return False

def run(root,expected):
    if digest(root/'quota-manifest.json')!=expected: raise RuntimeError('explicit quota manifest mismatch')
    manifest=verify(root)
    # Explicit environment for version AND runner; no ambient runtime loaders,
    # browser policy overrides, or inherited profile/storage settings.
    env={k:os.environ[k] for k in ('HOME','USER','LOGNAME','PATH','LANG','LC_ALL','XDG_RUNTIME_DIR') if k in os.environ}
    if children(): raise RuntimeError('host must have no pre-existing children')
    if ctypes.CDLL(None,use_errno=True).prctl(36,1,0,0,0)!=0:
        raise OSError(ctypes.get_errno(),'cannot own detached descendants')
    attempt=LOGS/f'host-{time.time_ns()}';attempt.mkdir()
    owned=SCRATCH/f'run-{time.time_ns()}'
    child=None;rc=1;error=None;clean=False
    handlers={sig:signal.getsignal(sig) for sig in (signal.SIGINT,signal.SIGTERM)}
    def interrupted(sig,frame): raise KeyboardInterrupt()
    for sig in handlers: signal.signal(sig,interrupted)
    try:
        owned.mkdir();profiles=owned/'profiles';profiles.mkdir()
        env.update(STORAGE_BUNDLE=str(root/'bundle'),STORAGE_LOG_DIR=str(attempt),STORAGE_DRIVER_PORT='19465',QUOTA_PROFILE_ROOT=str(profiles))
        child=subprocess.Popen(['node','--version'],env=env,stdout=subprocess.PIPE,text=True,start_new_session=True)
        version=child.communicate(timeout=5)[0].strip()
        if child.returncode: raise RuntimeError('Node version failed')
        receipt={'package':str(root),'manifestSha256':expected,'manifest':manifest,'profiles':str(profiles),'command':['node',str(root/'run-firefox.mjs')],'node':version,'environment':env}
        (attempt/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
        print('Quota host attempt: '+str(attempt),flush=True)
        with (attempt/'console.log').open('x') as log:
            child=subprocess.Popen(receipt['command'],env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
            rc=child.wait(timeout=215)
    except subprocess.TimeoutExpired as e: rc=124;error=str(e)
    except KeyboardInterrupt: rc=130;error='host interrupted'
    except Exception as e: rc=1;error=repr(e)
    finally:
        # Repeated signals cannot interrupt the bounded cleanup/exit record.
        for sig in handlers: signal.signal(sig,signal.SIG_IGN)
        try:
            clean=cleanup_owned(child)
            if not clean: rc=rc or 1
            if clean and owned.exists(): shutil.rmtree(owned)
        except Exception as e: rc=rc or 1;error=repr(e)
        finally:
            (attempt/'exit.json').write_text(json.dumps({'exitCode':rc,'error':error,'cleanupComplete':clean,'profileParentRemoved':not owned.exists()})+'\n')
            for sig,handler in handlers.items(): signal.signal(sig,handler)
    print(json.dumps({'exitCode':rc,'logs':str(attempt)}))
    return rc

if __name__=='__main__':
    action=sys.argv[1];root=Path(sys.argv[2]).resolve()
    if action=='freeze': freeze(root)
    elif action=='verify': verify(root);print('quota package verified')
    elif action=='run': raise SystemExit(run(root,sys.argv[3]))
    else: raise RuntimeError('expected freeze, verify or run')
