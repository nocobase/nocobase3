import { createPortalConfig } from '@nocobase/dev-config/eslint';

export default createPortalConfig({
  tsconfigRootDir: import.meta.dirname,
  ignores: [
    '.extension-state/**',
    'client-old/**',
    'public/r/**',
    'public/storage/**',
    'registry/**',
    'storage/**',
  ],
  overrides: [
    {
      name: 'app-template-default/database-task-project',
      files: ['database/{migrations,seeds}/*.ts'],
      languageOptions: {
        parserOptions: {
          project: './tsconfig.migrations.json',
          projectService: false,
          tsconfigRootDir: import.meta.dirname,
        },
      },
    },
    {
      name: 'app-template-default/browser-regression-script',
      files: ['tests/react-grab-picker-regression.mjs'],
      languageOptions: {
        globals: {
          console: 'readonly',
          performance: 'readonly',
          URL: 'readonly',
        },
      },
    },
  ],
});
