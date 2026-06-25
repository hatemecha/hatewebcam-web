import js from '@eslint/js';
import globals from 'globals';

const browserGlobals = {
  ...globals.browser,
  BlobTracking: 'readonly',
  BlinkDetection: 'readonly',
  CameraManager: 'readonly',
  EditorHistory: 'readonly',
  EffectManager: 'readonly',
  FaceDetection: 'readonly',
  FaceMesh: 'readonly',
  VideoTimeline: 'readonly',
};

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
    ],
  },
  js.configs.recommended,
  {
    files: ['js/**/*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: browserGlobals,
    },
    rules: baseRules,
  },
  {
    files: [
      'js/camera.js',
      'js/editor-history.js',
      'js/video-timeline.js',
      'js/effects/*.js',
    ],
    rules: {
      'no-unused-vars': 'off',
    },
  },
  {
    files: ['tests/**/*.mjs', 'scripts/**/*.mjs', 'playwright.config.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...browserGlobals,
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
