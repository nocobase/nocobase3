import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import ts from 'typescript-eslint';

// Vendored from `@rspress/core`'s ejectable theme and kept byte-for-byte, so that diffing against the new upstream copy
// is the whole of a Rspress upgrade. They are upstream's files: linting them reports on code this repository does not
// own and cannot fix in place, and the only actionable response — editing them — is the thing that breaks the diff. The
// same paths are listed in `.prettierignore`. Fix a genuine problem here by fixing it upstream and re-copying.
const VENDORED_FROM_RSPRESS = [
  'theme/components/Nav/**',
  'theme/components/NavHamburger/**',
  'theme/components/NavScreen/**',
  'theme/components/Search/**',
  'theme/components/HomeHero/**',
];

export default [
  {
    ignores: [
      'dist/',
      'doc_build/',
      'docs/**/_demos/',
      ...VENDORED_FROM_RSPRESS,
    ],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  // The theme is browser code; the build scripts and structural checks are Node. Declaring both keeps `process` and
  // `document` from each reading as an undefined global in the half of the package that legitimately uses it.
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: [
      '**/*.mjs',
      'rspress.config.ts',
      'plugins/**/*.ts',
      'shared/**/*.ts',
    ],
    languageOptions: { globals: globals.node },
  },
  // Hook dependency lists, conditionally called hooks, and missing keys in rendered lists. This package used to get
  // these from Biome; keeping them here is what made removing Biome a simplification rather than a loss of coverage.
  {
    files: ['theme/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
];
