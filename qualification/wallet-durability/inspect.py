#!/usr/bin/env python3
"""Reuse frozen storage byte inspector with unconditional evidence guards.

Its Python asserts are converted to explicit exceptions before execution, so
PYTHONOPTIMIZE cannot disable any check. Input text remains hash-bound in producer.
"""
import ast,sys,os
from pathlib import Path
stage=Path(sys.argv[1])
class Guards(ast.NodeTransformer):
    def visit_Assert(self,node):
        message=node.msg or ast.Constant('storage inspection guard failed')
        return ast.copy_location(ast.If(test=ast.UnaryOp(op=ast.Not(),operand=node.test),body=[ast.Raise(exc=ast.Call(func=ast.Name(id='RuntimeError',ctx=ast.Load()),args=[message],keywords=[]),cause=None)],orelse=[]),node)
source=stage/'inputs/storage/inspect.py'
text=source.read_text()
old="tool = '/home/jack/zcash-qualification-scratch/wasi-sdk-27.0-x86_64-linux/bin/llvm-objdump'"
if text.count(old)!=1: raise RuntimeError('inspector tool relocation seam drift')
text=text.replace(old, f"tool = {str(Path(os.environ['runtime_sdk'])/'bin/llvm-objdump')!r}")
tree=ast.fix_missing_locations(Guards().visit(ast.parse(text)))
exec(compile(tree,str(source),'exec'),{'__name__':'__main__'})
