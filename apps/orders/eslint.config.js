import { createPortalConfig } from '@nocobase/dev-config/eslint';

export default createPortalConfig({
  tsconfigRootDir: import.meta.dirname,
  ignores: ['dist/**', 'src/client/**'],
  overrides: [
    {
      name: 'orders/server',
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
      name: 'orders/migrations',
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
      name: 'orders/async-jsx-handlers',
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
