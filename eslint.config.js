import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const baseRules = {
  eqeqeq: ['error', 'always', { null: 'ignore' }],
  'no-console': ['error', { allow: ['warn', 'error'] }],
  'no-unused-vars': [
    'error',
    {
      argsIgnorePattern: '^_',
      caughtErrorsIgnorePattern: '^_',
      ignoreRestSiblings: true,
      varsIgnorePattern: '^_',
    },
  ],
};

export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'vendor/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      '.impeccable/**',
    ],
  },
  js.configs.recommended,
  ...svelte.configs['flat/recommended'].map((config) =>
    config.name === 'svelte:recommended:rules'
      ? { ...config, files: ['**/*.svelte'] }
      : config,
  ),
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: config.files ?? ['**/*.ts', '**/*.mts'],
  })),
  {
    files: ['**/*.svelte'],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        parser: tseslint.parser,
      },
    },
    rules: {
      'no-undef': 'off',
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
          varsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    files: ['src/**/*.{ts,svelte}', 'js/**/*.ts'],
    rules: {
      eqeqeq: baseRules.eqeqeq,
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['tests/**/*.mjs', 'scripts/**/*.mjs', 'playwright.config.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      ...baseRules,
      'no-console': 'off',
      'no-regex-spaces': 'off',
      'no-useless-escape': 'off',
    },
  },
];
