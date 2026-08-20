import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

import semver from "semver";

const sdkRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const checker = path.join(sdkRoot, "scripts/check-template-compatibility.mjs");
const sdkPackage = JSON.parse(
  fs.readFileSync(path.join(sdkRoot, "package.json"), "utf8"),
);
const supportedRange = sdkPackage.nocobase.supportedDefaultTemplateRange;
const compatibleBaseVersion = semver.minVersion(supportedRange)?.version;
if (!compatibleBaseVersion) {
  throw new Error(
    `Invalid supported Default Template range: ${supportedRange}`,
  );
}
const compatibleMajor = semver.major(compatibleBaseVersion);
const incompatibleBaseVersion =
  compatibleMajor > 0
    ? `${compatibleMajor - 1}.0.0`
    : semver.inc(compatibleBaseVersion, "major");
if (
  !incompatibleBaseVersion ||
  semver.satisfies(incompatibleBaseVersion, supportedRange)
) {
  throw new Error(
    `Unable to derive an incompatible version for: ${supportedRange}`,
  );
}

const runChecker = (packageJson) => {
  const projectRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "portal-sdk-compat-"),
  );
  fs.writeFileSync(
    path.join(projectRoot, "package.json"),
    JSON.stringify(packageJson),
  );
  const result = spawnSync(process.execPath, [checker], {
    cwd: projectRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      INIT_CWD: projectRoot,
      npm_config_local_prefix: projectRoot,
    },
  });
  fs.rmSync(projectRoot, { recursive: true, force: true });
  return result;
};

const runWorkspaceRootChecker = (packageJson) => {
  const projectRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "portal-sdk-compat-workspace-"),
  );
  fs.writeFileSync(
    path.join(projectRoot, "package.json"),
    JSON.stringify(packageJson),
  );
  fs.writeFileSync(
    path.join(projectRoot, "pnpm-workspace.yaml"),
    "packages:\n  - packages/*\n",
  );
  const result = spawnSync(process.execPath, [checker], {
    cwd: projectRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      INIT_CWD: projectRoot,
      npm_config_local_prefix: projectRoot,
      npm_lifecycle_event: "preinstall",
    },
  });
  fs.rmSync(projectRoot, { recursive: true, force: true });
  return result;
};

it("accepts a derived template with a compatible base version", () => {
  const result = runChecker({
    name: "@example/custom-portal",
    version: "8.4.0",
    nocobase: { defaultTemplateVersion: compatibleBaseVersion },
  });
  expect(result.status).toBe(0);
  expect(result.stdout).toContain(
    `supports Default Template ${compatibleBaseVersion}`,
  );
});

it("rejects an incompatible base template version with an actionable error", () => {
  const result = runChecker({
    name: "@example/custom-portal",
    version: "8.4.0",
    nocobase: { defaultTemplateVersion: incompatibleBaseVersion },
  });
  expect(result.status).toBe(1);
  expect(result.stderr).toMatch(/Incompatible NocoBase Portal SDK/);
  expect(result.stderr).toContain(
    `Current Default Template: ${incompatibleBaseVersion}`,
  );
  expect(result.stderr).toMatch(/Supported Default Template range/);
});

it("rejects projects that do not preserve their base template version", () => {
  const result = runChecker({
    name: "@example/custom-portal",
    version: "8.4.0",
  });
  expect(result.status).toBe(1);
  expect(result.stderr).toMatch(/Unable to determine/);
  expect(result.stderr).toMatch(/nocobase\.defaultTemplateVersion/);
});

it("skips private workspace roots during package preinstall", () => {
  const result = runWorkspaceRootChecker({
    name: "example-workspace",
    private: true,
  });
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("workspace root");
});
