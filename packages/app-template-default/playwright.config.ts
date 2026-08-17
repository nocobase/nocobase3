import { devices, defineConfig } from "@playwright/test";
import { loadEnv } from "vite";

import { loadPortalE2EEnvironment } from "./e2e/support/environment";

const fileEnvironment = loadEnv("e2e", process.cwd(), "");
Object.entries(fileEnvironment).forEach(([key, value]) => {
  if (process.env[key] === undefined) process.env[key] = value;
});

const environment = loadPortalE2EEnvironment();

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [["line"], ["html", { open: "never" }]]
    : "list",
  outputDir: "./test-results",
  use: {
    baseURL: environment.baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: `pnpm exec vite --host 127.0.0.1 --port ${environment.port} --strictPort --mode e2e`,
    url: environment.baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NOCOBASE_API_URL: environment.apiURL,
      NOCOBASE_PORTAL_BASE: environment.portalBase,
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
