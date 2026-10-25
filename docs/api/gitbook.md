# Maintain and publish this guide

This developer guide is built with VitePress and self-hosted on GitHub Pages. Edit the Markdown chapters in `docs/api`; `SUMMARY.md` supplies the developer guide sidebar and reading order. Internal specifications and historical planning documents remain available at their existing URLs, outside that navigation.

## GitHub Pages

The [hosted guide](https://jp4g.github.io/zcash.js/) deploys from `main` after the project checks pass. The workflow in `.github/workflows/docs.yml` builds VitePress with `--base /zcash.js/`, uploads the static site, and deploys it to GitHub Pages. Repository Settings → Pages uses **GitHub Actions** as its source.

To check the production build locally, run `npm run docs:build -- --base /zcash.js/`, then `npm run docs:preview -- --base /zcash.js/` and open `http://127.0.0.1:4173/zcash.js/`. An ordinary local build or dev server still uses `/`.

## Edit and check

Use the Node version pinned in `.nvmrc` with the repository dependencies installed. Edit the chapters directly; their displayed TypeScript blocks are the checked examples. Use function parameters for application-supplied configuration instead of fake usable endpoints or manifest digests.

```sh
npm run docs:typecheck
npm run docs:build
npm run docs:dev
```

The typecheck command checks guide snippets against `src/index.ts`, the actual package entry. It also retains the existing internal specification example checks. Typechecking does not execute transactions or prove backend compatibility.

When adding a chapter, include it in `SUMMARY.md`. The hosted and local VitePress sidebars use that same file. Make documentation changes in a focused PR from synced `main`.
