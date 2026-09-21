# Build from source

This page is for SDK development or testing an unpublished change. To use the
SDK in an application, follow [Installation](installation.md) and install from npm.

## Build and check

Use Node **22.12 or newer** and npm.

```sh
git clone https://github.com/jp4g/zcash.js.git
cd zcash.js
npm ci
npm run build
npm run check
```

The normal package build uses the committed runtime/proving assets and verifies
their integrity. It does not require rebuilding the native runtime with Rust.

## Make a local package

From the SDK checkout:

```sh
mkdir -p /tmp/zcash-package
npm pack --pack-destination /tmp/zcash-package
```

`npm pack` builds and verifies the included assets before creating the tarball.
It prints the filename, which includes the checkout's package version.

From your application, install that file (this example uses rc.4):

```sh
npm install /tmp/zcash-package/jp4g-zcash.js-0.1.0-rc.4.tgz
```

The tarball includes executable code, TypeScript declarations, lazy runtime and
proving assets, integrity/build inventories, the README/changelog, and licenses.
Source tests, private wallets, and internal planning documents are excluded.
Installing it needs no separate runtime/proving download.

## Check and preview the documentation

```sh
npm run docs:typecheck
npm run docs:build
npm run docs:dev
```

The last command serves the guide at `http://127.0.0.1:4173/`.
See [Maintain and publish](gitbook.md) for GitBook sync and site deployment.
