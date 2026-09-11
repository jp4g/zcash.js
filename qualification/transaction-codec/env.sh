#!/usr/bin/env bash
# All Cargo/cache/temp writes belong to this qualification, including offline locks.
export CARGO_HOME=/home/jack/zcash-transaction-codec-scratch/cargo
export CARGO_TARGET_DIR=/home/jack/zcash-transaction-codec-scratch/target
export TMPDIR=/home/jack/zcash-transaction-codec-scratch/tmp
export CARGO_BUILD_JOBS=2
export CARGO_NET_OFFLINE=true
export PYTHONDONTWRITEBYTECODE=1
unset RUSTFLAGS CARGO_ENCODED_RUSTFLAGS
# Accepted SDK, read-only; required by transitive secp256k1-sys.
export CC_wasm32_unknown_unknown=/home/jack/zcash-qualification-scratch/wasi-sdk-27.0-x86_64-linux/bin/clang
export AR_wasm32_unknown_unknown=/home/jack/zcash-qualification-scratch/wasi-sdk-27.0-x86_64-linux/bin/llvm-ar
