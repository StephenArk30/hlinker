import { defineConfig } from 'eslint/config';
import globals from 'globals';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';


export default defineConfig([
  {
    files: ['**/*.{js,mjs,cjs,ts}'],
    rules: {
      'indent': ['error', 2],
      'no-tabs': 'error',
      'quotes': ['error', 'single'],
      'comma-dangle': ['error', {
        'arrays': 'always-multiline',
        'objects': 'always-multiline',
        'imports': 'always-multiline',
        'exports': 'always-multiline',
        'functions': 'never',
      }],
    },
    languageOptions: {
      sourceType: 'module',
      ecmaVersion: 'latest',
    },
  },
  { files: ['**/*.{js,mjs,cjs,ts}'], languageOptions: { globals: globals.node } },
  { files: ['**/*.{js,mjs,cjs,ts}'], plugins: { js }, extends: ['js/recommended'] },
  tseslint.configs.recommended,
  {
    ignores: ['**/dist/**'],
  },
]);
