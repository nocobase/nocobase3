import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";

import semver from "semver";

import { portalSdkCompatibilityPlugin } from "../dist/vite/index.js";

it("the SDK 2 range includes Template 3 and excludes adjacent generations", () => {
  const range = ">=3.0.0 <4.0.0";
  expect(semver.satisfies("2.9.0", range)).toBe(false);
  expect(semver.satisfies("3.0.0", range)).toBe(true);
  expect(semver.satisfies("3.9.0", range)).toBe(true);
  expect(semver.satisfies("4.0.0", range)).toBe(false);
});

it("the Vite plugin reports an invalid base template version", () => {
  const projectRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "portal-sdk-vite-compat-")
  );

  try {
    fs.writeFileSync(
      path.join(projectRoot, "package.json"),
      JSON.stringify({
        name: "@example/custom-portal",
        version: "8.4.0",
        nocobase: { defaultTemplateVersion: "not-semver" },
      })
    );

    const plugin = portalSdkCompatibilityPlugin({ root: projectRoot });
    expect(() => plugin.configResolved()).toThrow(
      /Invalid nocobase\.defaultTemplateVersion: not-semver/
    );
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});
