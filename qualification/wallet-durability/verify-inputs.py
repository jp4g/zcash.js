#!/usr/bin/env python3
"""Checks consumed registry bytes, lock edges and wallet revision; no Python assert."""
import hashlib,json,tarfile,tomllib,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parent
CACHE=Path('/home/jack/zcash-wallet-durability-scratch/cargo/registry')
def require(ok,message):
    if not ok: raise RuntimeError(message)
def check(stage):
    a=tomllib.loads((stage/'inputs/storage/Cargo.lock').read_text())['package']
    b=tomllib.loads((stage/'source/Cargo.lock').read_text())['package']
    a=[p for p in a if p['name']!='issue-2-qualification']; selected=[p for p in b if p['name']!='issue-2-wallet-durability']
    require(a==selected,'non-root lock package/edge drift')
    receipts=[]; files=0
    for pkg in selected:
        prefix=f"{pkg['name']}-{pkg['version']}"
        archives=list((CACHE/'cache').glob(f'*/{prefix}.crate'))
        require(len(archives)==1,f'archive selection: {prefix}')
        archive=archives[0]
        require(hashlib.sha256(archive.read_bytes()).hexdigest()==pkg['checksum'],f'archive checksum: {prefix}')
        source=CACHE/'src'/archive.parent.name
        with tarfile.open(archive) as tar:
            for member in tar:
                if not member.isfile(): continue
                require(member.name.startswith(prefix+'/') and '..' not in Path(member.name).parts,'archive path')
                expected=tar.extractfile(member).read()
                require((source/member.name).read_bytes()==expected,f'extracted source drift: {member.name}')
                files+=1
        receipts.append({'package':prefix,'archive_sha256':pkg['checksum']})
    wallet={}
    for package in ['zakura-client-backend-0.1.0-rc4','zakura-client-sqlite-0.1.0-rc4','zakura-pczt-0.1.0-rc2']:
        p=next((CACHE/'src').glob(f'*/{package}/.cargo_vcs_info.json')); vcs=json.loads(p.read_text())
        require(vcs['git']['sha1']=='a9142ee100b3a563b7d9ba7a8e94201d00ad8154','wallet source revision')
        wallet[package]=vcs
    return {'lock_nonroot_equal':True,'registry_archives':receipts,'extracted_files_checked':files,'wallet':wallet}
if __name__=='__main__': print(json.dumps(check(Path(sys.argv[1])),indent=2))
