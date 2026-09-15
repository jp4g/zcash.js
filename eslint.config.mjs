import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import stylistic from '@stylistic/eslint-plugin';

export default defineConfig({
  files: ['src/**/*.{ts,mts}'],
  extends: [
    js.configs.recommended,
    tseslint.configs.recommended,
    stylistic.configs.customize({ indent: 2, quotes: 'single', semi: true, jsx: false, braceStyle: '1tbs' }),
  ],
  rules: {
    // Keep short unbraced guard returns; expand blocks and consecutive statements.
    '@stylistic/brace-style': ['error', '1tbs', { allowSingleLine: false }],
    '@stylistic/max-statements-per-line': ['error', { max: 1 }],
    '@stylistic/one-var-declaration-per-line': ['error', 'always'],
    '@stylistic/object-property-newline': ['error', { allowAllPropertiesOnSameLine: true }],
    '@stylistic/max-len': ['error', {
      code: 120,
      ignoreComments: true,
      ignoreUrls: true,
      ignoreRegExpLiterals: true,
      // Authenticated protocol identifiers and asset hashes stay unbroken.
      ignorePattern: "^\\s*(?:const (?:protocolRevision|revision) = |blake2b512: )'[a-z0-9:]+'[,;]?$",
    }],
    '@stylistic/no-mixed-operators': 'off',
    curly: ['error', 'multi-line'],
  },
});
