"""Inspect preserved raw bytes and paired map; do not read mutable target artifacts."""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

stage = Path(sys.argv[1])
artifact = stage / 'raw/issue_2_qualification.wasm'
raw = artifact.read_bytes()
assert raw[:8] == b'\0asm\x01\0\0\0'
tool = '/home/jack/zcash-qualification-scratch/wasi-sdk-27.0-x86_64-linux/bin/llvm-objdump'
disassembly = subprocess.check_output([tool, '-d', str(artifact)], text=True, timeout=60)
(stage / 'disassembly.txt').write_text(disassembly)
imports = json.loads(subprocess.check_output(['node', '-e',
    'const f=require("fs");console.log(JSON.stringify(WebAssembly.Module.imports(new WebAssembly.Module(f.readFileSync(process.argv[1])))));',
    str(artifact)], text=True, timeout=30))
assert all(i['kind'] == 'function' and i['module'] in ['__wbindgen_placeholder__', '__wbindgen_externref_xform__', './storage-host.mjs'] for i in imports), imports
class Reader:
    def __init__(self, data): self.data, self.pos = data, 0
    def byte(self):
        n = self.data[self.pos]; self.pos += 1; return n
    def uint(self):
        n = shift = 0
        while True:
            b = self.byte(); n |= (b & 127) << shift
            if not b & 128: return n
            shift += 7; assert shift <= 35
    def take(self, n):
        b = self.data[self.pos:self.pos+n]; self.pos += n; assert len(b) == n; return b
r = Reader(raw[8:]); sections = {}
while r.pos < len(r.data):
    kind, size = r.byte(), r.uint(); value = r.take(size)
    if kind: sections[kind] = value
m = Reader(sections[5]); memories = []
for _ in range(m.uint()):
    flags, initial = m.uint(), m.uint(); maximum = m.uint() if flags & 1 else None
    memories.append(dict(flags=flags, initial_pages=initial, maximum_pages=maximum))
assert len(memories) == 1 and not memories[0]['flags'] & 6
functions = []; growth = []; current = None
for line in disassembly.splitlines():
    match = re.match(r'^[0-9a-f]+ <(.+)>:$', line)
    if match: current = match[1]; functions.append(current)
    if 'memory.grow' in line: growth.append(current)
members = sorted(set(re.findall(r'libc\.a\(([^)]+)\)', (stage / 'runtime.map').read_text())))
forbidden = {'malloc', 'free', 'calloc', 'realloc', 'aligned_alloc', 'posix_memalign', 'sbrk', '__sbrk', 'dlmalloc', 'dlfree', 'dlcalloc', 'dlrealloc'}
assert not forbidden.intersection(functions)
assert not any(re.search(r'(malloc|calloc|realloc|sbrk)', member) for member in members)
assert len(growth) == 1 and 'dlmalloc' in growth[0], growth
assert any('memsys5Malloc' == name for name in functions), 'SQLite pool allocator missing'
print(json.dumps(dict(raw_sha256=hashlib.sha256(raw).hexdigest(),
    map_sha256=hashlib.sha256((stage / 'runtime.map').read_bytes()).hexdigest(),
    imports=imports, memories=memories, libc_members=members,
    memory_growth_owners=growth, retained_c_heap_symbols=[], memsys5_retained=True,
    limits='Static symbol/member exclusion plus byte inspection; runtime pool/Rust interleaving remains a separate executed control.'), indent=2))
