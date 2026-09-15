# Maintain and publish this guide

This guide uses ordinary Markdown and TypeScript fences, so the same chapters work in GitBook, on GitHub, and in the local VitePress preview. `SUMMARY.md` is the reading order. Internal specifications and historical planning documents are outside that navigation.

## GitHub Pages

The [hosted guide](https://jp4g.github.io/zcash.js/) deploys from `main` after the project checks pass. The existing workflow builds VitePress with `--base /zcash.js/`, uploads the static site, and deploys it to GitHub Pages. Repository Settings → Pages uses **GitHub Actions** as its source.

To check the production build locally, run `npm run docs:build -- --base /zcash.js/`, then `npm run docs:preview -- --base /zcash.js/` and open `http://127.0.0.1:4173/zcash.js/`. An ordinary local build or dev server still uses `/`.

## Optional GitBook Git Sync

1. Create or open your GitBook documentation space and enable GitHub Git Sync.
2. Grant GitBook access to `jp4g/zcash.js` and select `main`.
3. Import from GitHub for the initial sync so the repository supplies the guide.
4. For a space mapped to the repository root, the root `.gitbook.yaml` selects `docs/api`. If mapping the space directly to `docs/api`, its `README.md` and `SUMMARY.md` use GitBook's defaults.
5. Review the imported chapters and configure the site's visibility/domain in GitBook before publishing.

The repository configuration supplies the content and navigation. It does not create a GitBook account, connect a space, or publish a site. See GitBook's [content configuration](https://gitbook.com/docs/docs-as-code/git-sync/content-configuration) for the current space-mapping controls.

## Edit and check

Edit the chapters directly; their displayed TypeScript blocks are the checked examples. Use function parameters for application-supplied configuration instead of fake usable endpoints or manifest digests.

```sh
npm run docs:typecheck
npm run docs:build
npm run docs:dev
```

The typecheck command checks guide snippets against `src/index.ts`, the actual package entry. It also retains the existing internal specification example checks. Typechecking does not execute transactions or prove backend compatibility.

When adding a chapter, include it in `SUMMARY.md`. The local site's API sidebar uses that same file. Make documentation changes in a focused PR from synced `main`.
