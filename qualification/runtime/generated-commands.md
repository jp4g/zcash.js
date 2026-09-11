# Generated runtime command record

Commands ran from `/home/jack/zcash-worktrees/generated-runtime`. Full logs and
`commands.jsonl` are in `/home/jack/zcash-generated-runtime-logs`. The unchanged
recorder stores exact argv/cwd/exit/time/log hash and a fixed environment subset.
Runtime environment prefixes below supply the omitted RUNTIME_BINDINGS/TARGET values.
For rows marked `env.sh`, `source qualification/runtime/env.sh` preceded the recorder.
Historical failed commands refer to the test sources at that point, not later revisions.
Browser commands and their denial are in [browser/REPORT.md](browser/REPORT.md).

Initial preservation command (exit 0, directly observed; not a recorder run):

```sh
cp /home/jack/zcash-node-runtime-scratch/target/wasm32-unknown-unknown/debug/issue_2_qualification.wasm /home/jack/zcash-generated-runtime-scratch/initial/raw/issue_2_qualification.wasm
```

The raw build and two generator commands nested inside each pipeline also have
their own rows and source-bound records. Parent pipeline success does not replace
those individual producing command exits.

## 1. generator-version — exit 0

Started `2026-09-11T13:50:36.747098+00:00`; timeout `900` seconds; timed out `False`.
No runtime build environment required.

```sh
python3 qualification/harness.py --logs /home/jack/zcash-generated-runtime-logs --timeout 900 generator-version /home/jack/zcash-node-runtime-scratch/wasm-bindgen-0.2.128-x86_64-unknown-linux-musl/wasm-bindgen --version
```

Log: `/home/jack/zcash-generated-runtime-logs/generator-version-1789134636747089830.log`.
SHA-256: `bbb16f02b163b67d40241e0294d9f0eda3b10dc9fa8fd100ffd490a229a337a9`.

## 2. generate-initial-web — exit 0

Started `2026-09-11T13:50:50.527114+00:00`; timeout `900` seconds; timed out `False`.
No runtime build environment required.

```sh
python3 qualification/harness.py --logs /home/jack/zcash-generated-runtime-logs --timeout 900 generate-initial-web /home/jack/zcash-node-runtime-scratch/wasm-bindgen-0.2.128-x86_64-unknown-linux-musl/wasm-bindgen /home/jack/zcash-generated-runtime-scratch/initial/raw/issue_2_qualification.wasm --target web --out-dir /home/jack/zcash-generated-runtime-scratch/initial/web --out-name qualification
```

Log: `/home/jack/zcash-generated-runtime-logs/generate-initial-web-1789134650527105506.log`.
SHA-256: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.

## 3. generate-initial-nodejs — exit 0

Started `2026-09-11T13:50:51.175202+00:00`; timeout `900` seconds; timed out `False`.
No runtime build environment required.

```sh
python3 qualification/harness.py --logs /home/jack/zcash-generated-runtime-logs --timeout 900 generate-initial-nodejs /home/jack/zcash-node-runtime-scratch/wasm-bindgen-0.2.128-x86_64-unknown-linux-musl/wasm-bindgen /home/jack/zcash-generated-runtime-scratch/initial/raw/issue_2_qualification.wasm --target nodejs --out-dir /home/jack/zcash-generated-runtime-scratch/initial/nodejs --out-name qualification
```

Log: `/home/jack/zcash-generated-runtime-logs/generate-initial-nodejs-1789134651175194369.log`.
SHA-256: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.

## 4. baseline-node-red — exit 1

Started `2026-09-11T13:51:32.056414+00:00`; timeout `120.0` seconds; timed out `False`.
No runtime build environment required.

```sh
python3 qualification/harness.py --logs /home/jack/zcash-generated-runtime-logs --timeout 120.0 baseline-node-red node qualification/runtime/test-runtime.cjs
```

Log: `/home/jack/zcash-generated-runtime-logs/baseline-node-red-1789134692056406967.log`.
SHA-256: `00ba4e051739d9791dc72acf93d73c56bd27bfead6486e983a723976096fbb19`.

## 5. generated-contract-red — exit 1

Started `2026-09-11T13:52:06.734312+00:00`; timeout `900` seconds; timed out `False`.
No runtime build environment required.

```sh
python3 qualification/harness.py --logs /home/jack/zcash-generated-runtime-logs --timeout 900 generated-contract-red node qualification/runtime/test-generated.cjs
```

Log: `/home/jack/zcash-generated-runtime-logs/generated-contract-red-1789134726734305203.log`.
SHA-256: `e9223c71f812781943b823835ff7664fd130e2460f9bc268bd580f1fc08b8a93`.

## 6. host-controls-red — exit 1

Started `2026-09-11T13:53:28.600515+00:00`; timeout `900` seconds; timed out `False`.
No runtime build environment required.

```sh
python3 qualification/harness.py --logs /home/jack/zcash-generated-runtime-logs --timeout 900 host-controls-red node qualification/runtime/test-host.mjs
```

Log: `/home/jack/zcash-generated-runtime-logs/host-controls-red-1789134808600505930.log`.
SHA-256: `557dc23d88e8ff13f54ded001989f7a3c6d95b0f9340c81f96a817b7dc6d065d`.

## 7. host-controls-green — exit 0

Started `2026-09-11T13:53:56.383516+00:00`; timeout `900` seconds; timed out `False`.
No runtime build environment required.

```sh
python3 qualification/harness.py --logs /home/jack/zcash-generated-runtime-logs --timeout 900 host-controls-green node qualification/runtime/test-host.mjs
```

Log: `/home/jack/zcash-generated-runtime-logs/host-controls-green-1789134836383506022.log`.
SHA-256: `ca45d27c7faf93a32a7deba673f2080f406f4d550097683a24bb3e62f16956d8`.

## 8. existing-node-controls — exit 0

Started `2026-09-11T13:53:56.488079+00:00`; timeout `120.0` seconds; timed out `False`.
Environment: `env.sh`.

```sh
python3 qualification/harness.py --logs /home/jack/zcash-generated-runtime-logs --timeout 120.0 existing-node-controls node --test qualification/runtime/test-worker-harness.cjs qualification/runtime/test-lifecycle.cjs
```

Log: `/home/jack/zcash-generated-runtime-logs/existing-node-controls-1789134836488069098.log`.
SHA-256: `e9299e7aa6906bce7b3108de734643d73d91374d723dda3a9c5785e4d8dad0f5`.

## 9. existing-inspector-controls — exit 0

Started `2026-09-11T13:53:56.993065+00:00`; timeout `120.0` seconds; timed out `False`.
Environment: `env.sh`.

```sh
python3 qualification/harness.py --logs /home/jack/zcash-generated-runtime-logs --timeout 120.0 existing-inspector-controls python3 -m unittest discover -s qualification/runtime -p test_inspection_inputs.py
```

Log: `/home/jack/zcash-generated-runtime-logs/existing-inspector-controls-1789134836993054673.log`.
SHA-256: `5ccd76e8fb90bd81172f8cfe3eeec8a591d9d1ab0396345fccbed1630ed7bc50`.

## 10. loader-controls-red — exit 1

Started `2026-09-11T13:54:17.126678+00:00`; timeout `900` seconds; timed out `False`.
No runtime build environment required.

```sh
python3 qualification/harness.py --logs /home/jack/zcash-generated-runtime-logs --timeout 900 loader-controls-red node qualification/runtime/test-loader.cjs
```

Log: `/home/jack/zcash-generated-runtime-logs/loader-controls-red-1789134857126650048.log`.
SHA-256: `6c823ad46074d1f0fa0001923a1d2707a48d9bcd48f239376e0ba777a56dde79`.

## 11. fresh-raw-build — exit 0

Started `2026-09-11T13:53:09.024537+00:00`; timeout `900` seconds; timed out `False`.
Environment: `env.sh`.

```sh
python3 qualification/harness.py --logs /home/jack/zcash-generated-runtime-logs --timeout 900 fresh-raw-build cargo build --offline --locked --manifest-path qualification/runtime/Cargo.toml --target wasm32-unknown-unknown --lib --message-format=json
```

Log: `/home/jack/zcash-generated-runtime-logs/fresh-raw-build-1789134789024530044.log`.
SHA-256: `48a75669aeba876db720461d520a7224d073778030b7135baf628c5821a88432`.

## 12. fresh-generate-web — exit 0

Started `2026-09-11T13:54:32.846619+00:00`; timeout `900` seconds; timed out `False`.
Environment: `env.sh`.

```sh
python3 qualification/harness.py --logs /home/jack/zcash-generated-runtime-logs --timeout 900 fresh-generate-web /home/jack/zcash-node-runtime-scratch/wasm-bindgen-0.2.128-x86_64-unknown-linux-musl/wasm-bindgen /home/jack/zcash-generated-runtime-scratch/build-1789134789001628123/raw/issue_2_qualification.wasm --target web --out-dir /home/jack/zcash-generated-runtime-scratch/build-1789134789001628123/web --out-name qualification --keep-lld-exports
```

Log: `/home/jack/zcash-generated-runtime-logs/fresh-generate-web-1789134872846613114.log`.
SHA-256: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.

## 13. fresh-generate-nodejs — exit 0

Started `2026-09-11T13:54:33.462379+00:00`; timeout `900` seconds; timed out `False`.
Environment: `env.sh`.

```sh
python3 qualification/harness.py --logs /home/jack/zcash-generated-runtime-logs --timeout 900 fresh-generate-nodejs /home/jack/zcash-node-runtime-scratch/wasm-bindgen-0.2.128-x86_64-unknown-linux-musl/wasm-bindgen /home/jack/zcash-generated-runtime-scratch/build-1789134789001628123/raw/issue_2_qualification.wasm --target nodejs --out-dir /home/jack/zcash-generated-runtime-scratch/build-1789134789001628123/nodejs --out-name qualification --keep-lld-exports
```

Log: `/home/jack/zcash-generated-runtime-logs/fresh-generate-nodejs-1789134873462373143.log`.
SHA-256: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.

## 14. fresh-build-pipeline — exit 0

Started `2026-09-11T13:53:08.970449+00:00`; timeout `1100.0` seconds; timed out `False`.
Environment: `env.sh`.

```sh
python3 qualification/harness.py --logs /home/jack/zcash-generated-runtime-logs --timeout 1100.0 fresh-build-pipeline python3 qualification/runtime/build-generated.py
```

Log: `/home/jack/zcash-generated-runtime-logs/fresh-build-pipeline-1789134788970438407.log`.
SHA-256: `14a04b2f0a7739fa04c37cb0a80f3dfb35e12d1f6c65c0911c129fe486a9e9c8`.

## 15. foundation-harness-controls — exit 0

Started `2026-09-11T13:54:45.648703+00:00`; timeout `120.0` seconds; timed out `False`.
Environment: `env.sh`.

```sh
python3 qualification/harness.py --logs /home/jack/zcash-generated-runtime-logs --timeout 120.0 foundation-harness-controls python3 -m unittest discover -s qualification -p 'test_*.py'
```

Log: `/home/jack/zcash-generated-runtime-logs/foundation-harness-controls-1789134885648694674.log`.
SHA-256: `2466c8d81ef367aa31c6546a45601f08d22d3cf3cdfad4fc5a0a8a4462a40210`.

## 16. historical-inspection — exit 0

Started `2026-09-11T13:54:46.450853+00:00`; timeout `120.0` seconds; timed out `False`.
Environment: `env.sh`.

```sh
python3 qualification/harness.py --logs /home/jack/zcash-generated-runtime-logs --timeout 120.0 historical-inspection python3 qualification/runtime/inspect.py
```

Log: `/home/jack/zcash-generated-runtime-logs/historical-inspection-1789134886450845857.log`.
SHA-256: `d9c2ad38db6ee13bb2e50bc16c11aef8ff29186216b3d09452f99d5c5364032a`.

## 17. package-fresh-bindings — exit 0

Started `2026-09-11T13:55:38.967966+00:00`; timeout `900` seconds; timed out `False`.
No runtime build environment required.

```sh
python3 qualification/harness.py --logs /home/jack/zcash-generated-runtime-logs --timeout 900 package-fresh-bindings python3 qualification/runtime/package-bindings.py /home/jack/zcash-generated-runtime-scratch/build-1789134789001628123
```

Log: `/home/jack/zcash-generated-runtime-logs/package-fresh-bindings-1789134938967958774.log`.
SHA-256: `1a4608b4e91e132584b16f58148a4c36c0dd858125837570f2da1c623e3d4436`.

## 18. generated-contract-green — exit 0

Started `2026-09-11T13:55:39.128023+00:00`; timeout `900` seconds; timed out `False`.
No runtime build environment required.

```sh
RUNTIME_BINDINGS=/home/jack/zcash-generated-runtime-scratch/build-1789134789001628123 python3 qualification/harness.py --logs /home/jack/zcash-generated-runtime-logs --timeout 900 generated-contract-green node qualification/runtime/test-generated.cjs
```

Log: `/home/jack/zcash-generated-runtime-logs/generated-contract-green-1789134939128014592.log`.
SHA-256: `7c85ecd5c326594f25e140ead80e31374dd945d373bdf4c528c1088ebd43111f`.

## 19. loader-controls-green — exit 0

Started `2026-09-11T13:55:39.229075+00:00`; timeout `900` seconds; timed out `False`.
No runtime build environment required.

```sh
python3 qualification/harness.py --logs /home/jack/zcash-generated-runtime-logs --timeout 900 loader-controls-green node qualification/runtime/test-loader.cjs
```

Log: `/home/jack/zcash-generated-runtime-logs/loader-controls-green-1789134939229067617.log`.
SHA-256: `bc7cef657d6787f8af9881c854fa5e9801dd254ca475f2302f292fdc4833f8c3`.

## 20. generated-node-first — exit 1

Started `2026-09-11T13:56:10.148350+00:00`; timeout `180.0` seconds; timed out `False`.
No runtime build environment required.

```sh
RUNTIME_BINDINGS=/home/jack/zcash-generated-runtime-scratch/build-1789134789001628123 python3 qualification/harness.py --logs /home/jack/zcash-generated-runtime-logs --timeout 180.0 generated-node-first node qualification/runtime/test-runtime.cjs
```

Log: `/home/jack/zcash-generated-runtime-logs/generated-node-first-1789134970148340814.log`.
SHA-256: `5ccfa29ac494a77e6b016b3b4526864e1ac5a06bf69b71543ecabfc6f50cb456`.

## 21. package-consumer-v2 — exit 0

Started `2026-09-11T13:56:59.495173+00:00`; timeout `900` seconds; timed out `False`.
No runtime build environment required.

```sh
python3 qualification/harness.py --logs /home/jack/zcash-generated-runtime-logs --timeout 900 package-consumer-v2 python3 qualification/runtime/package-bindings.py /home/jack/zcash-generated-runtime-scratch/build-1789134789001628123 /home/jack/zcash-generated-runtime-scratch/execution-1
```

Log: `/home/jack/zcash-generated-runtime-logs/package-consumer-v2-1789135019495165673.log`.
SHA-256: `5cf973f8363cdd341b8f77026e8eea9798062641fa9f9a7a05df450f8ade64ac`.

## 22. generated-node-second — exit 0

Started `2026-09-11T13:56:59.718341+00:00`; timeout `180.0` seconds; timed out `False`.
No runtime build environment required.

```sh
RUNTIME_BINDINGS=/home/jack/zcash-generated-runtime-scratch/execution-1 python3 qualification/harness.py --logs /home/jack/zcash-generated-runtime-logs --timeout 180.0 generated-node-second node qualification/runtime/test-runtime.cjs
```

Log: `/home/jack/zcash-generated-runtime-logs/generated-node-second-1789135019718329734.log`.
SHA-256: `f71496c82c3e03d281a7a1c9a05e6e117a6b5965b89180b30fe40c1a99f515d2`.

## 23. deeper-runtime-red — exit 1

Started `2026-09-11T13:58:14.431652+00:00`; timeout `180.0` seconds; timed out `False`.
No runtime build environment required.

```sh
RUNTIME_BINDINGS=/home/jack/zcash-generated-runtime-scratch/execution-1 python3 qualification/harness.py --logs /home/jack/zcash-generated-runtime-logs --timeout 180.0 deeper-runtime-red node qualification/runtime/test-runtime.cjs
```

Log: `/home/jack/zcash-generated-runtime-logs/deeper-runtime-red-1789135094431644087.log`.
SHA-256: `c8dc8bbcb97c174cce4e1253a13abf07c0a01a952140efc875e9cd81dc98d687`.

## 24. bundle-input-red — exit 1

Started `2026-09-11T13:59:04.568675+00:00`; timeout `900` seconds; timed out `False`.
Environment: `env.sh`.

```sh
python3 qualification/harness.py --logs /home/jack/zcash-generated-runtime-logs --timeout 900 bundle-input-red python3 -m unittest discover -s qualification/runtime -p test_bundle_inputs.py
```

Log: `/home/jack/zcash-generated-runtime-logs/bundle-input-red-1789135144568655903.log`.
SHA-256: `8a4a4ab2fdb11f509cc29065f0dc8d259651453ea3d5127d115d6b2e2f2d02fd`.

## 25. fresh-raw-build — exit 0

Started `2026-09-11T13:59:47.476885+00:00`; timeout `900` seconds; timed out `False`.
Environment: `env.sh`.

```sh
python3 qualification/harness.py --logs /home/jack/zcash-generated-runtime-logs --timeout 900 fresh-raw-build cargo build --offline --locked --manifest-path qualification/runtime/Cargo.toml --target wasm32-unknown-unknown --lib --message-format=json
```

Log: `/home/jack/zcash-generated-runtime-logs/fresh-raw-build-1789135187476877884.log`.
SHA-256: `ee67deaf3e6e5a9ff5169fc478af1c31dad1d25424139ed95ddfc22f99708bef`.

## 26. fresh-generate-web — exit 0

Started `2026-09-11T13:59:48.266759+00:00`; timeout `900` seconds; timed out `False`.
Environment: `env.sh`.

```sh
python3 qualification/harness.py --logs /home/jack/zcash-generated-runtime-logs --timeout 900 fresh-generate-web /home/jack/zcash-node-runtime-scratch/wasm-bindgen-0.2.128-x86_64-unknown-linux-musl/wasm-bindgen /home/jack/zcash-generated-runtime-scratch/build-1789135187453484355/raw/issue_2_qualification.wasm --target web --out-dir /home/jack/zcash-generated-runtime-scratch/build-1789135187453484355/web --out-name qualification --keep-lld-exports
```

Log: `/home/jack/zcash-generated-runtime-logs/fresh-generate-web-1789135188266753569.log`.
SHA-256: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.

## 27. fresh-generate-nodejs — exit 0

Started `2026-09-11T13:59:48.832561+00:00`; timeout `900` seconds; timed out `False`.
Environment: `env.sh`.

```sh
python3 qualification/harness.py --logs /home/jack/zcash-generated-runtime-logs --timeout 900 fresh-generate-nodejs /home/jack/zcash-node-runtime-scratch/wasm-bindgen-0.2.128-x86_64-unknown-linux-musl/wasm-bindgen /home/jack/zcash-generated-runtime-scratch/build-1789135187453484355/raw/issue_2_qualification.wasm --target nodejs --out-dir /home/jack/zcash-generated-runtime-scratch/build-1789135187453484355/nodejs --out-name qualification --keep-lld-exports
```

Log: `/home/jack/zcash-generated-runtime-logs/fresh-generate-nodejs-1789135188832554881.log`.
SHA-256: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.

## 28. final-build-pipeline — exit 0

Started `2026-09-11T13:59:47.418095+00:00`; timeout `1100.0` seconds; timed out `False`.
Environment: `env.sh`.

```sh
python3 qualification/harness.py --logs /home/jack/zcash-generated-runtime-logs --timeout 1100.0 final-build-pipeline python3 qualification/runtime/build-generated.py
```

Log: `/home/jack/zcash-generated-runtime-logs/final-build-pipeline-1789135187418087566.log`.
SHA-256: `0a6b1defd92c24e5ae005a3ee2bb7b9803059a388fae6a61740cca6ac64c171a`.

## 29. bundle-input-green — exit 0

Started `2026-09-11T14:00:25.253132+00:00`; timeout `900` seconds; timed out `False`.
Environment: `env.sh`.

```sh
python3 qualification/harness.py --logs /home/jack/zcash-generated-runtime-logs --timeout 900 bundle-input-green python3 -m unittest discover -s qualification/runtime -p 'test_*inputs.py'
```

Log: `/home/jack/zcash-generated-runtime-logs/bundle-input-green-1789135225253124160.log`.
SHA-256: `eba5518e3f20c577ef849511a99b028fe3e6efcaf0532a19d5e0125f08e180a3`.

## 30. generated-inspection-first — exit 0

Started `2026-09-11T14:00:25.454456+00:00`; timeout `120.0` seconds; timed out `False`.
Environment: `env.sh`.

```sh
python3 qualification/harness.py --logs /home/jack/zcash-generated-runtime-logs --timeout 120.0 generated-inspection-first python3 qualification/runtime/inspect.py --bundle /home/jack/zcash-generated-runtime-scratch/build-1789134789001628123 --target web
```

Log: `/home/jack/zcash-generated-runtime-logs/generated-inspection-first-1789135225454448380.log`.
SHA-256: `44c70eb9051ab7d17de635f2f0da7f3369522decd65eeb77d0772e1d1213d160`.

## 31. package-final-bindings — exit 0

Started `2026-09-11T14:00:51.495243+00:00`; timeout `900` seconds; timed out `False`.
No runtime build environment required.

```sh
python3 qualification/harness.py --logs /home/jack/zcash-generated-runtime-logs --timeout 900 package-final-bindings python3 qualification/runtime/package-bindings.py /home/jack/zcash-generated-runtime-scratch/build-1789135187453484355 /home/jack/zcash-generated-runtime-scratch/execution-2
```

Log: `/home/jack/zcash-generated-runtime-logs/package-final-bindings-1789135251495231580.log`.
SHA-256: `bf71a39279adc453ef8711b72a9aa5b9132a02913e428820727d2c79aecfe3a7`.

## 32. final-raw-inspection — exit 0

Started `2026-09-11T14:00:51.763394+00:00`; timeout `120.0` seconds; timed out `False`.
Environment: `env.sh`.

```sh
python3 qualification/harness.py --logs /home/jack/zcash-generated-runtime-logs --timeout 120.0 final-raw-inspection python3 qualification/runtime/inspect.py --bundle /home/jack/zcash-generated-runtime-scratch/build-1789135187453484355 --target raw
```

Log: `/home/jack/zcash-generated-runtime-logs/final-raw-inspection-1789135251763374035.log`.
SHA-256: `273621f958f933cd2c428dc6a7a08893e24459031b5ea5f9acf1a6aafdb9837f`.

## 33. final-web-inspection — exit 0

Started `2026-09-11T14:00:55.988462+00:00`; timeout `120.0` seconds; timed out `False`.
Environment: `env.sh`.

```sh
python3 qualification/harness.py --logs /home/jack/zcash-generated-runtime-logs --timeout 120.0 final-web-inspection python3 qualification/runtime/inspect.py --bundle /home/jack/zcash-generated-runtime-scratch/build-1789135187453484355 --target web
```

Log: `/home/jack/zcash-generated-runtime-logs/final-web-inspection-1789135255988452952.log`.
SHA-256: `53726dbeb8b033964d43701da63661f926fa082c98b1d2de871e0ff623613744`.

## 34. final-nodejs-inspection — exit 0

Started `2026-09-11T14:01:00.000500+00:00`; timeout `120.0` seconds; timed out `False`.
Environment: `env.sh`.

```sh
python3 qualification/harness.py --logs /home/jack/zcash-generated-runtime-logs --timeout 120.0 final-nodejs-inspection python3 qualification/runtime/inspect.py --bundle /home/jack/zcash-generated-runtime-scratch/build-1789135187453484355 --target nodejs
```

Log: `/home/jack/zcash-generated-runtime-logs/final-nodejs-inspection-1789135260000492331.log`.
SHA-256: `8e2c6c4ca1b58ea6928d7bc5d8a4de53cc1c8bc25c566d519e2ab0202e40e776`.

## 35. final-node — exit 0

Started `2026-09-11T14:00:51.755604+00:00`; timeout `180.0` seconds; timed out `False`.
No runtime build environment required.

```sh
RUNTIME_BINDINGS=/home/jack/zcash-generated-runtime-scratch/execution-2 python3 qualification/harness.py --logs /home/jack/zcash-generated-runtime-logs --timeout 180.0 final-node node qualification/runtime/test-runtime.cjs
```

Log: `/home/jack/zcash-generated-runtime-logs/final-node-1789135251755594628.log`.
SHA-256: `ecd6cabbb9b2393c1aa1be727abcb8483a7a366c59a6ce58c68f85a824a95010`.

## 36. final-web-in-node — exit 0

Started `2026-09-11T14:00:51.768290+00:00`; timeout `180.0` seconds; timed out `False`.
No runtime build environment required.

```sh
RUNTIME_TARGET=web RUNTIME_BINDINGS=/home/jack/zcash-generated-runtime-scratch/execution-2 python3 qualification/harness.py --logs /home/jack/zcash-generated-runtime-logs --timeout 180.0 final-web-in-node node qualification/runtime/test-runtime.cjs
```

Log: `/home/jack/zcash-generated-runtime-logs/final-web-in-node-1789135251768280848.log`.
SHA-256: `edf92cc992796967a54c3bdadb1f8bf2811a8ac0bafe0f7c6cefe1a3e3d7b61e`.

## 37. final-controls — exit 0

Started `2026-09-11T14:02:31.029372+00:00`; timeout `120.0` seconds; timed out `False`.
Environment: `env.sh`.

```sh
RUNTIME_BINDINGS=/home/jack/zcash-generated-runtime-scratch/execution-2 python3 qualification/harness.py --logs /home/jack/zcash-generated-runtime-logs --timeout 120.0 final-controls node --test qualification/runtime/test-generated.cjs qualification/runtime/test-host.mjs qualification/runtime/test-loader.cjs qualification/runtime/test-worker-harness.cjs qualification/runtime/test-lifecycle.cjs
```

Log: `/home/jack/zcash-generated-runtime-logs/final-controls-1789135351029364083.log`.
SHA-256: `bc47f1ad6d375825b30ce58ce050be706077390784c6998793f22823138e945e`.

## 38. final-inspector-controls — exit 0

Started `2026-09-11T14:02:31.594026+00:00`; timeout `120.0` seconds; timed out `False`.
Environment: `env.sh`.

```sh
python3 qualification/harness.py --logs /home/jack/zcash-generated-runtime-logs --timeout 120.0 final-inspector-controls python3 -m unittest discover -s qualification/runtime -p 'test_*inputs.py'
```

Log: `/home/jack/zcash-generated-runtime-logs/final-inspector-controls-1789135351594018040.log`.
SHA-256: `e4dc9219f2467db33d6a13eab81b5433518c662ddf17e01b8fb6449a48b465d4`.

## 39. review-fix-reinspection — exit 0

Started `2026-09-11T14:02:31.801419+00:00`; timeout `120.0` seconds; timed out `False`.
Environment: `env.sh`.

```sh
python3 qualification/harness.py --logs /home/jack/zcash-generated-runtime-logs --timeout 120.0 review-fix-reinspection python3 qualification/runtime/inspect.py --stage review-fix-link
```

Log: `/home/jack/zcash-generated-runtime-logs/review-fix-reinspection-1789135351801410146.log`.
SHA-256: `d54eed949048bb55ea9b3ade98a7e64aaf2b88854f92efb148a2114a3092cf76`.

## 40. final-evidence-check — exit 0

Started `2026-09-11T14:05:00.718431+00:00`; timeout `120.0` seconds; timed out `False`.
No runtime build environment required.

```sh
python3 qualification/harness.py --logs /home/jack/zcash-generated-runtime-logs --timeout 120.0 final-evidence-check python3 /home/jack/zcash-generated-runtime-logs/verify-final-evidence.py
```

Log: `/home/jack/zcash-generated-runtime-logs/final-evidence-check-1789135500718423674.log`.
SHA-256: `6ebe0fcac1bb120f295be87c9a937a43022355cd61628715d716f8cb35c6242b`.
