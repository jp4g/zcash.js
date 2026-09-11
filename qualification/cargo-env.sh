#!/usr/bin/env bash
# Source from the repository root. All mutable Cargo output stays disposable.
if [[ $(rustc -V) != 'rustc 1.98.1 (48a229cea 2026-09-01)' ]]; then
    echo 'This experiment requires the recorded Rust 1.98.1 toolchain.' >&2
    return 1
fi
export CARGO_HOME=/home/jack/zcash-qualification-scratch/cargo
export CARGO_TARGET_DIR=/home/jack/zcash-qualification-scratch/target
export CARGO_BUILD_JOBS=2
export CARGO_NET_RETRY=1
export CARGO_HTTP_TIMEOUT=60
