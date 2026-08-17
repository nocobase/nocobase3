import { expect, test } from "@playwright/test";

import {
  loadPortalE2EEnvironment,
  requirePortalE2ECredentials,
  resolvePortalTestURL,
} from "./support";

const environment = loadPortalE2EEnvironment();

test("signs in and preserves the session after reload", async ({ page }) => {
  const credentials = requirePortalE2ECredentials(environment);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto(resolvePortalTestURL(environment, "/login"));

  await page
    .getByLabel("Username or email", { exact: true })
    .fill(credentials.account);
  await page.getByLabel("Password", { exact: true }).fill(credentials.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  await expect
    .poll(() => new URL(page.url()).pathname)
    .not.toMatch(/\/(?:login|signin)\/?$/);

  await page.reload();
  await expect
    .poll(() => new URL(page.url()).pathname)
    .not.toMatch(/\/(?:login|signin)\/?$/);
  await expect(page.getByLabel("Username or email")).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});
