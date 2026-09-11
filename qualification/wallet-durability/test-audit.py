#!/usr/bin/env python3
"""Complete audit with isolated input mutations and the genuine pinned generator.

Usage: python3 -I test-audit.py STAGE (WD_SCRATCH set to owned output).
Only test copies of receipts relocate CARGO_HOME; original evidence is read-only.
"""
import json, os, shutil, subprocess, sys, tempfile, unittest
from pathlib import Path
STAGE=Path(sys.argv.pop(1)).resolve()
OWNED=Path(os.environ['WD_SCRATCH']).resolve()
REGISTRY=Path('registry/src/index.crates.io-1949cf8c6b5b557f')
PACKAGES=['zakura-client-backend-0.1.0-rc4','zakura-client-sqlite-0.1.0-rc4','zakura-pczt-0.1.0-rc2']

class AuditInventoryTests(unittest.TestCase):
    def test_inventories(self):
        original=json.loads((STAGE/'provenance.json').read_text())
        cache=Path(original['environment']['CARGO_HOME'])
        cases=('missing_all','missing_package','missing_file','unexpected_file','modified_bytes','missing_scanner','stale_scanner','extra_source','missing_artifact','altered_artifact','extra_artifact','valid')
        for optimized in (False,True):
            for case in cases:
                with self.subTest(optimized=optimized,case=case), tempfile.TemporaryDirectory(prefix='audit-test-',dir=OWNED) as temporary:
                    root=Path(temporary); stage=root/'stage';stage.mkdir()
                    for entry in STAGE.iterdir():
                        if entry.name in ('source','inputs','bundle','raw'):
                            shutil.copytree(entry,stage/entry.name)
                        elif entry.name in ('producer.json','provenance.json'):
                            receipt=json.loads(entry.read_text())
                            receipt['environment']['CARGO_HOME']=str(root/'cargo')
                            # The SQLite bytes remain linked to the same checked source.
                            receipt['additional_inputs']={k.replace(str(cache),str(root/'cargo')):v for k,v in receipt['additional_inputs'].items()}
                            (stage/entry.name).write_text(json.dumps(receipt))
                        else: (stage/entry.name).symlink_to(entry,target_is_directory=entry.is_dir())
                    registry=root/'cargo'/REGISTRY;registry.mkdir(parents=True)
                    (root/'cargo/registry/cache').symlink_to(cache/'registry/cache',target_is_directory=True)
                    for entry in (cache/REGISTRY).iterdir():
                        if entry.name in PACKAGES: shutil.copytree(entry,registry/entry.name)
                        else: (registry/entry.name).symlink_to(entry,target_is_directory=True)
                    victim=next((registry/PACKAGES[0]/'src').rglob('*.rs'))
                    if case=='missing_all':
                        for package in PACKAGES: shutil.rmtree(registry/package)
                    elif case=='missing_package': shutil.rmtree(registry/PACKAGES[1])
                    elif case=='missing_file': victim.unlink()
                    elif case=='unexpected_file': victim.with_name('unexpected.rs').write_text('// unexpected\n')
                    elif case=='modified_bytes': victim.write_bytes(victim.read_bytes()+b'\n// changed\n')
                    elif case=='missing_scanner': (stage/'inputs/scanner/src/lib.rs').unlink()
                    elif case=='stale_scanner': (stage/'inputs/scanner/src/lib.rs').write_bytes(subprocess.check_output(['git','show','e338313:qualification/scanner/src/lib.rs'],cwd=Path(__file__).resolve().parents[2]))
                    elif case=='extra_source': (stage/'source/extra.py').write_text('# unexpected')
                    elif case=='missing_artifact': (stage/'bundle/storage_bg.wasm').unlink()
                    elif case=='altered_artifact': (stage/'bundle/storage.js').write_text('// altered')
                    elif case=='extra_artifact': (stage/'bundle/extra.js').write_text('// unexpected')
                    command=[sys.executable]+(['-O'] if optimized else [])+[str(Path(__file__).with_name('audit.py')),str(stage)]
                    result=subprocess.run(command,capture_output=True,text=True,env={**os.environ,'WD_SCRATCH':str(root),'PYTHONDONTWRITEBYTECODE':'1','TMPDIR':str(root)},timeout=180)
                    if case=='valid':
                        self.assertEqual(result.returncode,0,result.stderr)
                        receipt=json.loads(result.stdout)
                        self.assertTrue(receipt['pass']);self.assertEqual(receipt['wallet_git_source_files_checked'],180)
                        self.assertEqual(len(receipt['regenerated_byte_identical']),4)
                    else:
                        self.assertNotEqual(result.returncode,0,result.stdout)
                        self.assertIn('wallet source' if case in cases[:5] else 'inventory drift',result.stderr)
                    print(json.dumps({'optimized':optimized,'case':case,'exit':result.returncode,'pass':True}),flush=True)
if __name__=='__main__': unittest.main(verbosity=2)
