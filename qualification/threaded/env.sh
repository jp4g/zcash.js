#!/usr/bin/env bash
export CARGO_HOME=/home/jack/zcash-threaded-scratch/cargo
export CARGO_TARGET_DIR=/home/jack/zcash-threaded-scratch/target
export TMPDIR=/home/jack/zcash-threaded-scratch/tmp
export CARGO_BUILD_JOBS=2
export CARGO_NET_RETRY=1
export CARGO_HTTP_TIMEOUT=60
export PYTHONDONTWRITEBYTECODE=1
export runtime_sdk=/home/jack/zcash-qualification-scratch/wasi-sdk-27.0-x86_64-linux
export CC_wasm32_unknown_unknown="$runtime_sdk/bin/clang"
export AR_wasm32_unknown_unknown="$runtime_sdk/bin/llvm-ar"
export CFLAGS_wasm32_unknown_unknown="--target=wasm32-wasi-threads --sysroot=$runtime_sdk/share/wasi-sysroot -matomics -mbulk-memory -pthread -DSQLITE_OS_OTHER=1 -USQLITE_THREADSAFE -DSQLITE_THREADSAFE=0 -DSQLITE_TEMP_STORE=3 -DSQLITE_OMIT_LOAD_EXTENSION=1"
export LIBSQLITE3_FLAGS='-DSQLITE_ENABLE_MEMSYS5 -DSQLITE_ZERO_MALLOC -DLONGDOUBLE_TYPE=double'
export RUSTFLAGS='-C target-feature=+atomics,+bulk-memory,+mutable-globals -C link-arg=--shared-memory -C link-arg=--import-memory -C link-arg=--max-memory=268435456'
