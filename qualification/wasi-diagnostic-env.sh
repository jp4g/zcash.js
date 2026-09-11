#!/usr/bin/env bash
# C diagnostics ONLY: this sysroot is not a qualified browser libc/allocator ABI.
# Source after cargo-env.sh. Rust remains wasm32-unknown-unknown; C uses WASI.
qualification_sdk=/home/jack/zcash-qualification-scratch/wasi-sdk-27.0-x86_64-linux
export CC_wasm32_unknown_unknown="$qualification_sdk/bin/clang"
export AR_wasm32_unknown_unknown="$qualification_sdk/bin/llvm-ar"
export CFLAGS_wasm32_unknown_unknown="--target=wasm32-wasi --sysroot=$qualification_sdk/share/wasi-sysroot -DSQLITE_OS_OTHER=1 -USQLITE_THREADSAFE -DSQLITE_THREADSAFE=0 -DSQLITE_TEMP_STORE=3 -DSQLITE_OMIT_LOAD_EXTENSION=1"
export CC_ENABLE_DEBUG_OUTPUT=1
