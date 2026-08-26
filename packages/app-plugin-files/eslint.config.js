import { createPortalConfig, node } from '@nocobase/dev-config/eslint';

export default createPortalConfig({
  tsconfigRootDir: import.meta.dirname,
  ignores: ['public/r/**'],
  environment: node.map((config) => ({
    ...config,
    files: ['database/migrations/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}'],
  })),
  overrides: [
    {
      name: 'app-plugin-files/database-migrations-project',
      files: ['database/migrations/*.ts'],
      languageOptions: {
        parserOptions: {
          project: './tsconfig.migrations.json',
          projectService: false,
          tsconfigRootDir: import.meta.dirname,
        },
      },
    },
    {
      name: 'app-plugin-files/registry-project',
      files: ['registry/**/*.{ts,tsx}', 'registry-env.d.ts'],
      languageOptions: {
        parserOptions: {
          project: './tsconfig.registry.json',
          projectService: false,
          tsconfigRootDir: import.meta.dirname,
        },
      },
    },
  ],
});
