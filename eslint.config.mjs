import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

const noUnusedVars = {
  argsIgnorePattern: '^_',
  varsIgnorePattern: '^_',
  caughtErrorsIgnorePattern: '^_',
};

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'frontend/node_modules/**',
      'dist/**',
      'public/vendor/**',
      'coverage/**',
    ],
  },

  // Base recommended rules everywhere.
  js.configs.recommended,

  // TypeScript backend + JS/TS config files — run under Node.
  {
    files: ['**/*.ts'],
    extends: [tseslint.configs.recommended],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', noUnusedVars],
      // The SignalK server `app` object and its delta payloads are untyped, so
      // `any` at those boundaries is idiomatic rather than a smell.
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  // Buildless browser webapp (hand-written ES modules, JSDoc-typed).
  {
    files: ['public/app/**/*.js'],
    languageOptions: {
      sourceType: 'module',
      globals: { ...globals.browser },
    },
    rules: {
      'no-unused-vars': ['error', noUnusedVars],
    },
  },

  // Node ESM dev tooling: vendoring/icon scripts, JS test suites, JS config.
  {
    files: [
      'frontend/scripts/**/*.mjs',
      'frontend/test/**/*.js',
      'frontend/*.config.js',
      'eslint.config.mjs',
    ],
    languageOptions: {
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      'no-unused-vars': ['error', noUnusedVars],
    },
  },

  // Must be last: turn off stylistic rules that Prettier owns.
  prettier,
);
