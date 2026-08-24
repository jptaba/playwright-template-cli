'use strict';

const js = require('@eslint/js');
const tseslint = require('typescript-eslint');
const framework = require('./eslint-rules');

module.exports = tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'report-out/**',
      'playwright-report/**',
      'blob-report/**',
      'test-results/**',
      'results/**',
      '.auth/**',
      '.playwright-cli/**',
      'docs/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  framework.configs.recommended,

  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { process: 'readonly', console: 'readonly', Buffer: 'readonly', URL: 'readonly' },
    },
    rules: {
      // Types are half of the guardrail: an action with an implicit `any`
      // parameter accepts whatever a model passes it (§07).
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-console': 'off',
    },
  },

  {
    // Lint rules are plain CommonJS and are linted as such.
    files: ['eslint-rules/**/*.js', 'eslint.config.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        __dirname: 'readonly',
        __filename: 'readonly',
        require: 'readonly',
        module: 'writable',
        exports: 'writable',
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-var-requires': 'off',
    },
  },

  {
    // `async ({}, use) => …` is Playwright's own fixture idiom: a fixture that
    // depends on nothing still has to declare the dependency object.
    files: ['src/fixtures/**/*.ts', 'targets/*/fixtures.ts'],
    rules: { 'no-empty-pattern': 'off' },
  },

  {
    // Specs assert; that is their job. Non-null assertions on fixture payloads
    // read better than a guard clause in a test body.
    files: ['targets/*/tests/**/*.ts', 'tests/**/*.ts'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },
);
