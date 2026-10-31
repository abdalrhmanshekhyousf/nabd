// @ts-check
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      'server/prisma/migrations/**',
      'server/uploads/**',
    ],
  },

  // Shared base for every JS/TS file in the repo
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'warn',
      eqeqeq: ['error', 'always'],
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
    },
  },

  // Frontend: React (browser)
  {
    files: ['client/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    ...reactHooks.configs.flat['recommended-latest'],
  },
  {
    files: ['client/**/*.{ts,tsx}'],
    ...reactRefresh.configs.vite,
  },

  // Backend: Node / Express
  {
    files: ['server/**/*.{ts,js}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
    },
    rules: {
      'no-console': 'off',
    },
  },

  // Root and tooling config files
  {
    files: ['*.{js,cjs,mjs}', '**/*.config.{js,ts}'],
    languageOptions: { globals: globals.node },
  },

  // Must be last: turns off rules that conflict with Prettier
  prettier,
);
