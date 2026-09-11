#!/usr/bin/env bash
set -euo pipefail
# Run from the repository root. Fetches sources/dependencies only.
source qualification/cargo-env.sh
scratch=/home/jack/zcash-qualification-scratch
mkdir -p "$scratch" /home/jack/zcash-qualification-logs
if [[ ! -d "$scratch/wallet/.git" ]]; then
    python3 qualification/harness.py source-clone git clone https://github.com/zakura-core/wallet-libraries.git "$scratch/wallet"
fi
[[ -z $(git -C "$scratch/wallet" status --porcelain) ]]
python3 qualification/harness.py source-fetch git -C "$scratch/wallet" fetch origin a9142ee100b3a563b7d9ba7a8e94201d00ad8154
python3 qualification/harness.py source-checkout git -C "$scratch/wallet" checkout --detach a9142ee100b3a563b7d9ba7a8e94201d00ad8154
python3 qualification/harness.py proofs-fetch curl -fsSL --max-time 60 https://raw.githubusercontent.com/zakura-core/common/f4526b0fa86406589732c8fb3849855fb92c43a2/crates/zcash_proofs/Cargo.toml -o "$scratch/proofs-Cargo.toml"
archive="$scratch/wasi-sdk-27.0-x86_64-linux.tar.gz"
if [[ ! -f "$archive" ]]; then
    python3 qualification/harness.py --timeout 180 sdk-fetch curl -fsSL --max-time 170 https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-27/wasi-sdk-27.0-x86_64-linux.tar.gz -o "$archive"
fi
# Checks the archive digest before extraction as well as retained source bytes.
python3 qualification/harness.py source-verify python3 qualification/verify_sources.py
if [[ ! -d "$scratch/wasi-sdk-27.0-x86_64-linux" ]]; then
    python3 qualification/harness.py sdk-extract tar -xzf "$archive" -C "$scratch"
fi
python3 qualification/harness.py dependency-fetch cargo fetch --locked --manifest-path qualification/consumer/Cargo.toml
