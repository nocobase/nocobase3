import js from '@eslint/js';
import promise from 'eslint-plugin-promise';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/lib/**',
      '**/build/**',
      '**/coverage/**',
      '**/fixtures/**',
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{js,mjs,cjs,ts,tsx,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        sleep: 'readonly',
        prettyFormat: 'readonly',
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      promise,
      react,
      'react-hooks': reactHooks,
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      ...promise.configs.recommended.rules,
      'no-empty-function': 'off',
      'no-unused-vars': 'off',
      'no-useless-catch': 'off',
      'no-useless-escape': 'warn',
      'prefer-const': 'warn',
      'prefer-rest-params': 'warn',
      // Existing packages contain legacy single-line control flow. Keep this
      // visible while avoiding a repository-wide formatting-only diff.
      curly: ['warn', 'all'],
      'brace-style': ['warn', '1tbs', { allowSingleLine: false }],
      indent: ['warn', 2, { SwitchCase: 1 }],
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-empty-object-type': 'warn',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-this-alias': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-var-requires': 'off',
      'promise/always-return': 'off',
      'promise/catch-or-return': 'warn',
      'promise/param-names': 'off',
      'react/display-name': 'off',
      'react/jsx-uses-react': 'off',
      'react/no-unescaped-entities': 'warn',
      'react/prop-types': 'off',
      'react/react-in-jsx-scope': 'off',
    },
    settings: {
      react: { version: '19.1' },
    },
  },
);
