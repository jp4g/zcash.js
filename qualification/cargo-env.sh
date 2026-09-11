#!/usr/bin/env bash
# Source from the repository root. All mutable Cargo output stays disposable.
export CARGO_HOME=/home/jack/zcash-qualification-scratch/cargo
export CARGO_TARGET_DIR=/home/jack/zcash-qualification-scratch/target
export CARGO_BUILD_JOBS=2
export CARGO_NET_RETRY=1
export CARGO_HTTP_TIMEOUT=60
