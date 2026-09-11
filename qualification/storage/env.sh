#!/usr/bin/env bash
# Source only in this disposable experiment. Never source the old cargo-env.sh.
export CARGO_HOME=/home/jack/zcash-storage-scratch/cargo
export CARGO_TARGET_DIR=/home/jack/zcash-storage-scratch/target
export CARGO_BUILD_JOBS=2
export CARGO_NET_RETRY=1
export CARGO_HTTP_TIMEOUT=60
export TMPDIR=/home/jack/zcash-storage-scratch
export PYTHONDONTWRITEBYTECODE=1
export runtime_sdk=/home/jack/zcash-qualification-scratch/wasi-sdk-27.0-x86_64-linux
export CC_wasm32_unknown_unknown="$runtime_sdk/bin/clang"
export AR_wasm32_unknown_unknown="$runtime_sdk/bin/llvm-ar"
export CFLAGS_wasm32_unknown_unknown="--target=wasm32-wasi --sysroot=$runtime_sdk/share/wasi-sysroot -DSQLITE_OS_OTHER=1 -USQLITE_THREADSAFE -DSQLITE_THREADSAFE=0 -DSQLITE_TEMP_STORE=3 -DSQLITE_OMIT_LOAD_EXTENSION=1"
export LIBSQLITE3_FLAGS='-DSQLITE_ENABLE_MEMSYS5 -DSQLITE_ZERO_MALLOC -DLONGDOUBLE_TYPE=double -DSQLITE_OMIT_WAL'
export CC_ENABLE_DEBUG_OUTPUT=1
