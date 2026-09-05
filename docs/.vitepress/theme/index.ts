import DefaultTheme from 'vitepress/theme';
import { h } from 'vue';
import './style.css';

export default {
  extends: DefaultTheme,
  Layout: () => h(DefaultTheme.Layout, null, {
    'doc-before': () => h('p', { class: 'proposal-notice', role: 'note' },
      'PROPOSED · PRE-IMPLEMENTATION — Design documentation. No usable SDK or validated wallet runtime.'),
  }),
};
