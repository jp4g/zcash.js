#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
component_scratch=/home/jack/zcash-network-parameters-scratch
export CARGO_HOME="$component_scratch/cargo"
export CARGO_TARGET_DIR="$component_scratch/target"
export CARGO_BUILD_JOBS=2
export TMPDIR="$component_scratch/tmp"
mkdir -p "$TMPDIR"
# The registry was copied into this component's cache. Never download implicitly.
node /home/jack/zcash.js/node_modules/typescript/bin/tsc -p tsconfig.json
node tests/network-parameters/parameters.test.mjs
cargo test --offline --locked --manifest-path qualification/network-parameters/Cargo.toml
cargo build --offline --locked --manifest-path qualification/network-parameters/Cargo.toml
"$CARGO_TARGET_DIR/debug/network-parameters-qualification" --constants > "$component_scratch/source-constants.json"
cmp tests/network-parameters/source-constants.json "$component_scratch/source-constants.json"
cargo build --offline --locked --release --target wasm32-unknown-unknown --lib --manifest-path qualification/network-parameters/Cargo.toml
/home/jack/zcash-node-runtime-scratch/wasm-bindgen-0.2.128-x86_64-unknown-linux-musl/wasm-bindgen --target web --out-dir "$component_scratch/web" --out-name adapter "$CARGO_TARGET_DIR/wasm32-unknown-unknown/release/network_parameters_qualification.wasm"
# Regular files avoid Node subprocess pipe/socket restrictions in this sandbox.
node --input-type=module -e 'import {cases} from "./tests/network-parameters/parity.mjs"; for(const c of cases()) console.log(`${Buffer.from(c.bytes).toString("hex")}\t${c.height}`)' > "$component_scratch/native-input.txt"
"$CARGO_TARGET_DIR/debug/network-parameters-qualification" < "$component_scratch/native-input.txt" > "$component_scratch/native-output.jsonl"
node --input-type=module -e 'import{readFile,writeFile}from"node:fs/promises"; const p=process.argv[1]; await writeFile(p+"/native-observations.json",JSON.stringify((await readFile(p+"/native-output.jsonl","utf8")).trim().split("\n").map(JSON.parse)))' "$component_scratch"
node qualification/network-parameters/test-parity.mjs "$component_scratch/native-observations.json" "$component_scratch/web"
