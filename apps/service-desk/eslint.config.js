import { createPortalConfig } from '@nocobase/dev-config/eslint';

export default createPortalConfig({
  tsconfigRootDir: import.meta.dirname,
  ignores: ['dist/**', 'src/client/**'],
  overrides: [
    {
      name: 'service-desk/server',
      files: ['src/server/*.ts'],
      languageOptions: {
        parserOptions: {
          project: './tsconfig.server.json',
          projectService: false,
          tsconfigRootDir: import.meta.dirname,
        },
      },
    },
    {
      name: 'service-desk/migrations',
      files: ['src/server/migrations/*.ts', 'src/server/seed/*.ts'],
      languageOptions: {
        parserOptions: {
          project: './tsconfig.migrations.json',
          projectService: false,
          tsconfigRootDir: import.meta.dirname,
        },
      },
    },
    {
      name: 'service-desk/async-jsx-handlers',
      files: ['client/**/*.{ts,tsx}'],
      rules: {
        '@typescript-eslint/no-misused-promises': [
          'error',
          { checksVoidReturn: { attributes: false } },
        ],
      },
    },
  ],
});
