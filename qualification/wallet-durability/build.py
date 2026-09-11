#!/usr/bin/env python3
"""Immutable build receipts; only this task's scratch is writable. No tool install."""
import hashlib, json, os, shutil, subprocess, sys, time
from pathlib import Path
ROOT=Path(__file__).resolve().parent
REPO=ROOT.parents[1]
def require(condition,message):
    if not condition: raise RuntimeError(message)
def digest(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def inventory(root): return {str(p.relative_to(root)): {'sha256':digest(p),'bytes':p.stat().st_size} for p in sorted(root.rglob('*')) if p.is_file()}
def run(args,env,cwd,output):
    with output.open('xb') as log:
        subprocess.run(args,env=env,cwd=cwd,stdout=log,stderr=subprocess.STDOUT,check=True)
def check_inputs(repo,pins,snapshot=None):
    for label,pin in pins.items():
        folder=snapshot/label if snapshot is not None else repo/pin['folder']
        tree=subprocess.check_output(['git','-C',str(repo),'ls-tree','-r','--name-only','-z',pin['revision'],'--',pin['folder']])
        expected={str(Path(n.decode()).relative_to(pin['folder'])) for n in tree.split(b'\0') if n}
        require(expected and expected==set(pin['files']),f'input pinned inventory drift: {label}')
        require(set(inventory(folder))==expected,f'input checkout inventory drift: {label}')
        for name,sha in pin['files'].items():
            pinned=subprocess.check_output(['git','-C',str(repo),'show',f"{pin['revision']}:{pin['folder']}/{name}"])
            require(hashlib.sha256(pinned).hexdigest()==sha,f'input pin drift: {label}/{name}')
            require((folder/name).read_bytes()==pinned,f'input checkout drift: {label}/{name}')

def main():
    SCRATCH=Path(os.environ['WD_SCRATCH']).resolve()
    SDK=Path(os.environ['WD_SDK']).resolve()
    BINDGEN=Path(os.environ['WD_BINDGEN']).resolve()
    wallet_repo=Path(os.environ['WD_WALLET_REPO']).resolve()
    pins=json.loads((ROOT/'inputs.json').read_text())
    check_inputs(REPO,pins)
    stage=Path(sys.argv[1]).resolve()
    require(stage.parent==SCRATCH,'stage must be a new direct child of owned scratch')
    stage.mkdir(); (stage/'raw').mkdir(); (stage/'bundle').mkdir(); (stage/'inputs').mkdir()
    shutil.copytree(ROOT,stage/'source')
    for label,pin in pins.items():
        shutil.copytree(REPO/pin['folder'],stage/'inputs'/label)
    check_inputs(REPO,pins,stage/'inputs')
    for name in ['cargo','target','tmp']: (SCRATCH/name).mkdir(exist_ok=True)
    env=dict(os.environ,CARGO_HOME=str(SCRATCH/'cargo'),CARGO_TARGET_DIR=str(SCRATCH/'target'),CARGO_BUILD_JOBS='2',RAYON_NUM_THREADS='2',CARGO_NET_OFFLINE='true',TMPDIR=str(SCRATCH/'tmp'),PYTHONDONTWRITEBYTECODE='1',WD_INPUTS=str(stage/'inputs'),WD_WALLET_REPO=str(wallet_repo),runtime_sdk=str(SDK),CC_wasm32_unknown_unknown=str(SDK/'bin/clang'),AR_wasm32_unknown_unknown=str(SDK/'bin/llvm-ar'),CFLAGS_wasm32_unknown_unknown=f'--target=wasm32-wasi --sysroot={SDK}/share/wasi-sysroot -DSQLITE_OS_OTHER=1 -USQLITE_THREADSAFE -DSQLITE_THREADSAFE=0 -DSQLITE_TEMP_STORE=3 -DSQLITE_OMIT_LOAD_EXTENSION=1',LIBSQLITE3_FLAGS='-DSQLITE_ENABLE_MEMSYS5 -DSQLITE_ZERO_MALLOC -DLONGDOUBLE_TYPE=double -DSQLITE_OMIT_WAL',CC_ENABLE_DEBUG_OUTPUT='1')
    tools={}
    for name,args in [('rustc',['rustc','-vV']),('cargo',['cargo','-V']),('clang',[str(SDK/'bin/clang'),'--version']),('bindgen',[str(BINDGEN),'--version']),('node',['node','--version'])]:
        tools[name]={'command':args,'version':subprocess.check_output(args,text=True).strip(),'sha256':digest(Path(shutil.which(args[0]) or args[0]).resolve())}
    require(tools['bindgen']['version']=='wasm-bindgen 0.2.128','exact approved generator')
    receipt={'repository':str(REPO),'started_ns':time.time_ns(),'inputs':inventory(stage/'inputs'),'source':inventory(stage/'source'),'tools':tools,'environment':{k:v for k,v in env.items() if k.startswith(('CARGO_','RAYON_','WD_','CFLAGS_','LIBSQLITE','CC_','AR_')) or k in ['TMPDIR','runtime_sdk']},'producer_git':subprocess.check_output(['git','-C',str(ROOT),'rev-parse','HEAD'],text=True).strip(),'role':'HIGH complex; no agents or model override'}
    registry=SCRATCH/'cargo/registry/src/index.crates.io-1949cf8c6b5b557f'
    extras=[SDK/'share/wasi-sysroot/lib/wasm32-wasi/libc.a',SDK/'bin/llvm-objdump',registry/'libsqlite3-sys-0.35.0/sqlite3/sqlite3.c',registry/'libsqlite3-sys-0.35.0/sqlite3/sqlite3.h']
    for name in ['rustc','cargo']: extras.append(Path(subprocess.check_output(['rustup','which',name],text=True).strip()))
    receipt['additional_inputs']={str(p):digest(p) for p in extras}
    (stage/'producer.json').write_text(json.dumps(receipt,indent=2)+'\n')
    run(['python3',str(stage/'source/verify-inputs.py'),str(stage)],env,stage/'source',stage/'registry.json')
    run(['cargo','build','--offline','--locked','--lib','--target','wasm32-unknown-unknown'],env,stage/'source',stage/'build.log')
    shutil.copyfile(SCRATCH/'target/wasm32-unknown-unknown/debug/issue_2_wallet_durability.wasm',stage/'raw/issue_2_qualification.wasm')
    shutil.copyfile(SCRATCH/'target/runtime.map',stage/'runtime.map')
    run([str(BINDGEN),str(stage/'raw/issue_2_qualification.wasm'),'--target','web','--keep-lld-exports','--out-dir',str(stage/'bundle'),'--out-name','storage'],env,stage/'source',stage/'bindgen.log')
    for name in ['storage-host.mjs','opfs.mjs','node-fs.mjs','browser-worker.mjs','node-harness.mjs','node-worker.mjs','browser-test.html']:
        shutil.copyfile(stage/'inputs/storage'/name,stage/'bundle'/name)
    for name in ['load.mjs','dispatch.mjs','suite.mjs','run-node.mjs','browser-test.mjs','process-owner.mjs','run-process.mjs']:
        if (stage/'source'/name).exists(): shutil.copyfile(stage/'source'/name,stage/'bundle'/name)
    (stage/'bundle/package.json').write_text('{"type":"module"}\n')
    run(['cargo','tree','--offline','--locked','--target','wasm32-unknown-unknown','-e','features'],env,stage/'source',stage/'features.txt')
    native_env=dict(env); native_env.pop('LIBSQLITE3_FLAGS',None)
    run(['cargo','build','--offline','--locked','--bin','issue-2-wallet-durability'],native_env,stage/'source',stage/'native-build.log')
    shutil.copyfile(SCRATCH/'target/debug/issue-2-wallet-durability',stage/'native-reference')
    (stage/'native-reference').chmod(0o700)
    run([str(stage/'native-reference')],native_env,stage/'source',stage/'native.log')
    receipt['native_binary_sha256']=digest(stage/'native-reference')
    lines=(stage/'native.log').read_text().splitlines()
    reference=json.loads(lines[-1])
    (stage/'bundle/reference.json').write_text(json.dumps(reference,separators=(',',':'))+'\n')
    receipt['native_log_sha256']=digest(stage/'native.log')
    run(['python3',str(stage/'source/inspect.py'),str(stage)],env,stage/'source',stage/'inspection.json')
    receipt['inspection_sha256']=digest(stage/'inspection.json')
    receipt['registry_sha256']=digest(stage/'registry.json')
    require(inventory(stage/'source')==receipt['source'],'producer source changed during build')
    require(inventory(stage/'inputs')==receipt['inputs'],'producer inputs changed during build')
    receipt['artifacts']=inventory(stage/'bundle') | {f'raw/{p.name}':{'sha256':digest(p),'bytes':p.stat().st_size} for p in (stage/'raw').iterdir()}
    receipt['map_sha256']=digest(stage/'runtime.map'); receipt['features_sha256']=digest(stage/'features.txt'); receipt['completed_ns']=time.time_ns()
    (stage/'provenance.json').write_text(json.dumps(receipt,indent=2)+'\n')
    print(stage,flush=True)
if __name__=='__main__': main()
