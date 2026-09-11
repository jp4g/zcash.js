#!/usr/bin/env python3
"""Reuse frozen storage byte inspector with unconditional evidence guards.

Its Python asserts are converted to explicit exceptions before execution, so
PYTHONOPTIMIZE cannot disable any check. Input text remains hash-bound in producer.
"""
import ast,sys
from pathlib import Path
stage=Path(sys.argv[1])
class Guards(ast.NodeTransformer):
    def visit_Assert(self,node):
        message=node.msg or ast.Constant('storage inspection guard failed')
        return ast.copy_location(ast.If(test=ast.UnaryOp(op=ast.Not(),operand=node.test),body=[ast.Raise(exc=ast.Call(func=ast.Name(id='RuntimeError',ctx=ast.Load()),args=[message],keywords=[]),cause=None)],orelse=[]),node)
source=stage/'inputs/storage/inspect.py'
tree=ast.fix_missing_locations(Guards().visit(ast.parse(source.read_text())))
exec(compile(tree,str(source),'exec'),{'__name__':'__main__'})
