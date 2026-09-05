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

const book = [
  ['Status & scope', 'README'],
  ['End-to-end walkthrough', 'walkthrough'],
  ['Design principles', 'principles'],
  ['Installation & imports', 'installation'],
  ['Networks & exact amounts', 'networks-amounts'],
  ['Public client', 'public-client'],
  ['Light client', 'light-client'],
  ['Wallet, runtime & storage', 'wallet-runtime'],
  ['Accounts, recovery & signers', 'accounts-signers'],
  ['Receive addresses', 'receive-addresses'],
  ['Sync & scan status', 'sync'],
  ['Balances, history & inventory', 'queries'],
  ['Send & shield', 'send-shield'],
  ['Reviewed proposals', 'proposals'],
  ['Local signing & external PCZT', 'signing'],
  ['Pending payments & recovery', 'operations'],
  ['Errors & lifecycle', 'errors-lifecycle'],
  ['Security & privacy', 'security-privacy'],
  ['Node & browser limits', 'platforms'],
  ['Full API reference', 'reference'],
  ['Exact declarations', 'public-api'],
  ['Rust/WASM host contract', 'host-contract'],
  ['Host operation mapping', 'host-mapping'],
].map(([text, slug]) => ({ text, link: `/api/${slug}` }));

export default defineConfig({
  title: 'zcash.js',
  description: 'Proposed Zcash TypeScript API, planning decisions and source research. Pre-implementation; no usable SDK.',
  lang: 'en-US',
  base: '/',
  cleanUrls: false,
  ignoreDeadLinks: false,
  themeConfig: {
    siteTitle: 'zcash.js / docs',
    nav: [
      { text: 'API · proposed', link: '/api/README', activeMatch: '/api/' },
      { text: 'Walkthrough', link: '/api/walkthrough' },
      { text: 'Research', link: '/research/zakura-api-capability-map', activeMatch: '/research/' },
    ],
    sidebar: [
      { text: 'Start here', items: [
        { text: 'Introduction', link: '/' },
        { text: 'Repository overview', link: '/repository' },
        { text: 'Contributing', link: '/contributing' },
      ] },
      { text: 'Proposed v1 API book', items: book },
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
              .replace(/^(?:\.\.\/)?README\.md(?=#|$)/, '/repository')
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
