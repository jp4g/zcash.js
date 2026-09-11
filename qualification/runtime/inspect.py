"""Read-only inventory of this linked module and LLVM disassembly; not runtime proof."""
import hashlib
import json
from pathlib import Path
import re

SCRATCH = Path('/home/jack/zcash-node-runtime-scratch')
LOGS = Path('/home/jack/zcash-node-runtime-logs')
artifact = SCRATCH / 'stages/adapter-link/issue_2_qualification.wasm'
raw = artifact.read_bytes()
assert raw[:8] == b'\0asm\x01\0\0\0'


class Reader:
    def __init__(self, data):
        self.data, self.pos = data, 0

    def byte(self):
        n = self.data[self.pos]
        self.pos += 1
        return n

    def uint(self):
        n = shift = 0
        while True:
            b = self.byte()
            n |= (b & 127) << shift
            if not b & 128:
                return n
            shift += 7
            assert shift <= 35

    def take(self, n):
        value = self.data[self.pos:self.pos+n]
        assert len(value) == n
        self.pos += n
        return value

    def string(self):
        return self.take(self.uint()).decode()


r = Reader(raw[8:])
sections = {}
while r.pos < len(r.data):
    section, size = r.byte(), r.uint()
    payload = r.take(size)
    if section:
        assert section not in sections
        sections[section] = payload

memory = Reader(sections[5])
memories = []
for _ in range(memory.uint()):
    flags, initial = memory.uint(), memory.uint()
    maximum = memory.uint() if flags & 1 else None
    assert flags & ~7 == 0
    memories.append(dict(initial_pages=initial, maximum_pages=maximum,
                         shared=bool(flags & 2), memory64=bool(flags & 4)))
assert memory.pos == len(memory.data)

export_reader = Reader(sections[7])
exports = []
for _ in range(export_reader.uint()):
    name, kind, index = export_reader.string(), export_reader.byte(), export_reader.uint()
    exports.append(dict(name=name, kind=kind, index=index))
assert export_reader.pos == len(export_reader.data)

records = [json.loads(s) for s in (LOGS / 'commands.jsonl').read_text().splitlines()]
def stage(label):
    return next(r for r in reversed(records) if r['label'] == label)

imports = json.loads(Path(stage('inspect-imports')['log']).read_text())['imports']
assert all(i['kind'] == 'function' for i in imports)
names = [f"{i['module']}.{i['name']}" for i in imports]
edges = {}
indirect = set()
growth = []
current = None
for line in Path(stage('disassemble')['log']).read_text().splitlines():
    m = re.match(r'^[0-9a-f]+ <(.+)>:$', line)
    if m:
        current = m[1]
        if current == 'CODE':
            current = None
        else:
            names.append(current)
            edges[len(names)-1] = set()
    elif current:
        if 'memory.grow' in line:
            growth.append(dict(function=current, instruction=line.strip()))
        m = re.search(r'\tcall\s+(\d+)\s*$', line)
        if m:
            edges[len(names)-1].add(int(m[1]))
        if '\tcall_indirect' in line:
            indirect.add(len(names)-1)
code = Reader(sections[10])
assert len(names) == len(imports) + code.uint()
assert all(i < len(names) for targets in edges.values() for i in targets)

def closure(root):
    seen, pending = set(), [root]
    while pending:
        i = pending.pop()
        if i not in seen:
            seen.add(i)
            pending.extend(edges.get(i, []))
    return seen

reachability = {}
for e in exports:
    if e['kind'] == 0 and e['name'].startswith('rt_'):
        reachable = closure(e['index'])
        reachability[e['name']] = dict(
            direct_function_count=len(reachable),
            indirect_call_boundaries=[names[i] for i in sorted(reachable & indirect)],
            memory_growth_owners=[g['function'] for g in growth if names.index(g['function']) in reachable],
            allocator_functions=[names[i] for i in sorted(reachable)
                                 if any(s in names[i] for s in ('memsys5', 'dlmalloc', 'sqlite3Mem'))],
        )

link_map = (SCRATCH / 'stages/adapter-link/runtime.map').read_text()
libc_members = sorted(set(re.findall(r'libc\.a\(([^)]+)\)', link_map)))
forbidden = {'malloc', 'free', 'calloc', 'realloc', 'aligned_alloc', 'posix_memalign',
             'sbrk', '__sbrk', 'dlmalloc', 'dlfree', 'dlcalloc', 'dlrealloc'}
retained_c_heap = sorted(forbidden.intersection(names))
assert not retained_c_heap
assert not any(re.search(r'(malloc|calloc|realloc|sbrk)', member) for member in libc_members)
assert len(growth) == 1 and 'dlmalloc' in growth[0]['function']

files = [artifact, SCRATCH / 'stages/adapter-link/runtime.map',
         Path('qualification/runtime/Cargo.lock'), Path('qualification/runtime/env.sh'),
         Path('qualification/runtime/adapter.c'), Path('qualification/runtime/src/lib.rs'),
         Path('qualification/runtime/build.rs'), Path('qualification/runtime/test-runtime.cjs')]
sdk = Path('/home/jack/zcash-qualification-scratch/wasi-sdk-27.0-x86_64-linux')
files += [sdk / 'bin/clang', sdk / 'share/wasi-sysroot/lib/wasm32-wasi/libc.a']
build = SCRATCH / 'target/wasm32-unknown-unknown/debug/build'
files += sorted(build.glob('*/out/adapter.o')) + sorted(build.glob('*/out/*sqlite3.o'))
print(json.dumps(dict(
    artifact=str(artifact), hashes={str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in files},
    artifact_bytes=len(raw), memories=memories, imports=imports, exports=exports,
    function_count=len(names), memory_growth=growth, libc_members=libc_members,
    retained_c_heap_symbols=retained_c_heap, direct_reachability=reachability,
    limits='Direct call closure only; indirect callback paths require runtime qualification. '
           'No libc heap function/member retained anywhere, including indirect targets. '
           'No instantiation or generated-bindings result.'
), indent=2, sort_keys=True))
