import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitepress';

const planning = [
  ['Decisions & scope', 'decision-log'],
  ['Namespace tree', 'api-namespace-audit'],
  ['Transactions & queries', 'transaction-query-api'],
  ['Keys, accounts & signers', 'keys-accounts-signers-api'],
  ['WASM host architecture', 'wasm-host-architecture'],
  ['Validation workplan', 'api-surface-workplan'],
  ['Deferred work', 'future-issues'],
].map(([text, slug]) => ({ text, link: `/planning/${slug}` }));
const research = [
  ['Capability map', 'zakura-api-capability-map'],
  ['Common landscape', 'zakura-common-landscape'],
  ['Provider landscape', 'provider-endpoint-landscape'],
  ['API inspiration', 'transaction-api-inspiration-review'],
].map(([text, slug]) => ({ text, link: `/research/${slug}` }));

const summary = readFileSync(new URL('../api/SUMMARY.md', import.meta.url), 'utf8');
const book = [...summary.matchAll(/^- \[(.+?)\]\(([^)]+)\.md\)$/gm)]
  .map(([, text, slug]) => ({ text, link: `/api/${slug}` }));

export default defineConfig({
  title: 'zcash.js',
  description: 'Practical TypeScript guides for zcash.js clients, wallets, signing, and payment recovery.',
  lang: 'en-US',
  base: '/',
  cleanUrls: false,
  ignoreDeadLinks: false,
  themeConfig: {
    siteTitle: 'zcash.js / docs',
    nav: [
      { text: 'API guide', link: '/api/README', activeMatch: '/api/' },
      { text: 'Walkthrough', link: '/api/walkthrough' },
      { text: 'Research', link: '/research/zakura-api-capability-map', activeMatch: '/research/' },
    ],
    sidebar: [
      { text: 'Start here', items: [
        { text: 'Introduction', link: '/' },
        { text: 'Repository overview', link: '/repository' },
        { text: 'Contributing', link: '/contributing' },
      ] },
      { text: 'Developer guide', items: book },
      { text: 'Planning · retained decisions', collapsed: true, items: planning },
      { text: 'Research · source evidence', collapsed: true, items: research },
    ],
    search: { provider: 'local' },
    outline: { level: [2, 3], label: 'On this page' },
    docFooter: { prev: 'Previous page', next: 'Next page' },
    returnToTopLabel: 'Back to top',
  },
  markdown: {
    // Preserve repository-relative Markdown links on GitHub, adapting only the
    // rendered site. Included root documents are served as repository pages.
    config(md) {
      md.core.ruler.after('inline', 'repository-links', (state) => {
        for (const block of state.tokens) {
          for (const token of block.children ?? []) {
            if (token.type !== 'link_open') continue;
            let href = token.attrGet('href');
            if (!href || /^(?:[a-z]+:|\/\/)/i.test(href)) continue;
            href = href
              .replace(/^(?:\.\.\/)?CONTRIBUTING\.md(?=#|$)/, '/contributing')
              .replace(/^docs\//, '/')
              .replace(/^(?:\.\/)?\.\.\//, '/')
              .replace(/public-api\.ts(?=#|$)/, 'public-api');
            token.attrSet('href', href);
          }
        }
      });
    },
  },
});
