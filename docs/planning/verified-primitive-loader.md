# Standalone primitive-loader package compilation

The parent continuation after commit
`37034281b1fc3842c47b0f9426b8e211fd712df7` failed during preparation with TS5112:
the compiler inherited the SDK caller directory containing `tsconfig.json` while
receiving explicit source files. This was a package preparation failure, not a
production runtime failure. The original compiler log and coordinator report
remain preserved under the provenance-fix scratch and logs directories.

`tests/runtime-primitive-loader/prepare.mjs` now runs the installed compiler with
its working directory explicitly set to the newly created isolated source
snapshot directory. Compilation therefore does not depend on the caller's
configuration. Explicit compiler options, including `--strict` and
`--noEmitOnError`, remain unchanged, as do committed-byte checks, provenance,
private pins, corpus verification, and strict package output inventory.

The fresh parent continuation script must bind to this correction's exact commit,
preserve the earlier script and artifacts, compare all package bytes other than
provenance with the original selected package, and require modified-source
rejection before output creation. Parent Node/HTTPS/Firefox execution and the
first independent HIGH loader review remain required; this correction does not
claim acceptance or whole H1 completion.
