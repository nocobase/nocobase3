import { devices, defineConfig } from '@playwright/test';
import { loadEnv } from 'vite';

import { loadPortalE2EEnvironment } from './e2e/support/environment';

const fileEnvironment = loadEnv('e2e', process.cwd(), '');
Object.entries(fileEnvironment).forEach(([key, value]) => {
  if (process.env[key] === undefined) process.env[key] = value;
});

const environment = loadPortalE2EEnvironment();
const appName = process.env.APP_NAME ?? 'crm';
const browserChannel = process.env.NOCOBASE_E2E_BROWSER_CHANNEL?.trim();

const commonPortalEnvironment = {
  APP_NAME: appName,
  APP_BASE_PATH: environment.portalBase,
  NOCOBASE_API_URL: environment.browserApiURL,
  NOCOBASE_PORTAL_BASE: environment.portalBase,
};

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'list',
  outputDir: './test-results',
  use: {
    baseURL: environment.baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: browserChannel ? 'off' : 'retain-on-failure',
  },
  webServer: [
    {
      command: `pnpm exec vite --host 127.0.0.1 --port ${environment.vitePort} --strictPort --mode e2e`,
      url: `${environment.viteOrigin}${environment.portalBase}`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...commonPortalEnvironment,
        APP_VITE_DEV_HOST: '127.0.0.1',
        APP_VITE_DEV_PORT: String(environment.vitePort),
      },
    },
    {
      command: 'pnpm exec tsx server/standalone.ts',
      url: environment.baseURL,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...commonPortalEnvironment,
        APP_SERVER_HOST: '127.0.0.1',
        APP_SERVER_PORT: String(environment.port),
        APP_VITE_DEV_URL: environment.viteOrigin,
        NOCOBASE_API_PROXY_TARGET: environment.apiURL,
      },
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(browserChannel ? { channel: browserChannel } : {}),
      },
    },
  ],
});
