// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'generated/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-member-accessibility': ['off'],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    /**
     * Command-line entry points. `no-console` exists to stop a request handler
     * writing past the logger; for a CLI, stdout *is* the interface, and routing
     * a prompt or a setup token through Nest's logger would stamp it with a
     * timestamp and a context tag nobody asked for.
     */
    files: ['src/**/*.cli.ts'],
    rules: {
      'no-console': 'off',
    },
  },
);
