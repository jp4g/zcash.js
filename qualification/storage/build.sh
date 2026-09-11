#!/usr/bin/env bash
set -euo pipefail
cd /home/jack/zcash-worktrees/storage-vfs
source qualification/storage/env.sh
storage_stage="${1:?usage: bash qualification/storage/build.sh /home/jack/zcash-storage-scratch/NEW-STAGE}"
case "$storage_stage" in /home/jack/zcash-storage-scratch/*) ;; *) exit 2 ;; esac
mkdir "$storage_stage"
mkdir "$storage_stage/raw" "$storage_stage/bundle"
cp -a qualification/storage "$storage_stage/source"
cargo build --offline --locked --manifest-path qualification/storage/Cargo.toml --target wasm32-unknown-unknown
cp "$CARGO_TARGET_DIR/wasm32-unknown-unknown/debug/issue_2_qualification.wasm" "$storage_stage/raw/"
cp /home/jack/zcash-storage-scratch/runtime.map "$storage_stage/"
/home/jack/zcash-node-runtime-scratch/wasm-bindgen-0.2.128-x86_64-unknown-linux-musl/wasm-bindgen \
  "$storage_stage/raw/issue_2_qualification.wasm" --target web --keep-lld-exports \
  --out-dir "$storage_stage/bundle" --out-name storage
cp qualification/storage/{load.mjs,storage-host.mjs,opfs.mjs,dispatch.mjs,suite.mjs,browser-worker.mjs,browser-test.mjs,browser-test.html} "$storage_stage/bundle/"
cargo tree --offline --locked --manifest-path qualification/storage/Cargo.toml --target wasm32-unknown-unknown -e features > "$storage_stage/features.txt"
python3 qualification/storage/inspect.py "$storage_stage" > "$storage_stage/inspection.json"
python3 qualification/storage/provenance.py "$storage_stage"
