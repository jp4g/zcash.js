#!/usr/bin/env python3
"""Coordinator-only seam: use explicitly reviewed corrected runner, unchanged logic."""
import hashlib,json,os,subprocess,sys,time
from pathlib import Path
runner=Path(sys.argv[1]).resolve(); expected=sys.argv[2]
repo=Path(__file__).resolve().parents[2]
if runner!=repo/'qualification/storage/run-firefox.mjs': raise RuntimeError('runner must be corrected storage runner in this checkout')
pins=json.loads((Path(__file__).resolve().parent/'inputs.json').read_text())
if expected!=pins['storage']['files']['run-firefox.mjs']: raise RuntimeError('runner differs from reviewed input pin')
raw=runner.read_bytes()
if hashlib.sha256(raw).hexdigest()!=expected: raise RuntimeError('corrected runner digest mismatch')
# Exact independently reviewed runner, resolved within this checkout.
old=b"const logs = process.env.STORAGE_LOG_DIR ?? '/home/jack/zcash-storage-logs';"
if raw.count(old)!=1: raise RuntimeError('runner logs seam changed; coordinator must adapt explicitly')
phase=os.environ.get('WALLET_DURABILITY_PHASE','all')
if phase not in ['all','tracer','interruptions']: raise RuntimeError('invalid phase')
root=Path(os.environ['WD_SCRATCH']).resolve()/f'host-runner-{time.time_ns()}'
root.mkdir()
realm=b'const events = [], pending = new Map();'
if raw.count(realm)!=1: raise RuntimeError('runner realm seam changed')
raw=raw.replace(realm,b'const events = globalThis.__walletRealmEvents = [], pending = new Map();')
(root/'run-firefox.mjs').write_bytes(raw)
static=(runner.parent/'serve-static.mjs').read_bytes()
pins=json.loads((Path(__file__).resolve().parent/'inputs.json').read_text())
if hashlib.sha256(static).hexdigest()!=pins['storage']['files']['serve-static.mjs']: raise RuntimeError('static responder differs from pinned storage source')
(root/'original-static.mjs').write_bytes(static)
(root/'serve-static.mjs').write_text("""import { serveStatic as original } from './original-static.mjs';
export function serveStatic(base,req,res) {
  if(req.url === '/wallet-phase') {
    res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
    res.end(JSON.stringify({phase:process.env.WALLET_DURABILITY_PHASE ?? 'all'}));return;
  }
  if(req.url === '/wallet-realms') {
    const events=globalThis.__walletRealmEvents || [];
    const created=events.filter(e=>e.method==='script.realmCreated' && e.params.type==='dedicated-worker').map(e=>e.params.realm);
    const destroyed=events.filter(e=>e.method==='script.realmDestroyed').map(e=>e.params.realm);
    res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
    res.end(JSON.stringify({created,destroyed}));return;
  }
  original(base,req,res);
}
""")
(root/'receipt.txt').write_text(f'runner={runner}\nsha256={expected}\nserve-static-sha256={hashlib.sha256(static).hexdigest()}\nSTORAGE_LOG_DIR env + expose existing realm event list + read-only lifecycle HTTP route; runner fixes independently supplied by coordinator.\n')
if not os.environ.get('STORAGE_BUNDLE'): raise RuntimeError('explicit STORAGE_BUNDLE required')
bundle=Path(os.environ['STORAGE_BUNDLE']).resolve()
stage=bundle.parent
if bundle!=stage/'bundle': raise RuntimeError('STORAGE_BUNDLE must resolve to stage/bundle')
provenance=json.loads((stage/'provenance.json').read_text())
if Path(__file__).read_bytes()!=(stage/'source/run-host.py').read_bytes(): raise RuntimeError('adapter differs from stage source')
actual={str(p.relative_to(stage/'bundle')):{'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size} for p in (stage/'bundle').rglob('*') if p.is_file()}
if actual!={k:v for k,v in provenance['artifacts'].items() if not k.startswith('raw/')}: raise RuntimeError('host bundle identity drift')
(root/'receipt.json').write_text(json.dumps({'runner':str(runner),'runner_sha256':expected,'adapter_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'files':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in root.iterdir() if p.is_file()},'provenance_sha256':hashlib.sha256((stage/'provenance.json').read_bytes()).hexdigest(),'bundle':str(bundle),'phase':phase},indent=2)+'\n')
env=dict(os.environ,STORAGE_BUNDLE=str(bundle))
if not env.get('STORAGE_LOG_DIR'): raise RuntimeError('explicit STORAGE_LOG_DIR required')
raise SystemExit(subprocess.call(['node',str(root/'run-firefox.mjs')],env=env))
