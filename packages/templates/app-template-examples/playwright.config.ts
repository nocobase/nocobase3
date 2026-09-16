import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.test.ts',
  timeout: 120_000,
  workers: 1,
  reporter: 'list',
  use: { trace: 'off' },
});
