import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  createAppHost,
  type AppDefinition,
  type AppHost,
} from "../dist/index.js";

const tempDirs: string[] = [];
const runningHosts: AppHost[] = [];

afterEach(async () => {
  await Promise.all(
    runningHosts.splice(0).map((host) => host.close("test cleanup")),
  );
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("AppRuntimeRegistry release deployment", () => {
  it("deploys the first release without publishing a provisional definition", async () => {
    const fixture = await createDeploymentFixture();
    const v1 = await fixture.createRelease("release-v1", "1.0.0", "ready");
    const { host, origin } = await startEmptyHost(fixture.appsDir);

    expect(host.registry.has("customer")).toBe(false);
    await expect(
      host.registry.deploy("customer", {
        target: v1.definition,
        operationId: "first-release",
        expectedCurrentReleaseId: null,
      }),
    ).resolves.toMatchObject({
      operationId: "first-release",
      previousReleaseId: null,
      activeReleaseId: "release-v1",
    });

    expect(host.registry.definition("customer")?.release?.releaseId).toBe(
      "release-v1",
    );
    await expect(fetchVersion(origin)).resolves.toBe("1.0.0");
  });

  it("does not publish the first release when readiness fails", async () => {
    const fixture = await createDeploymentFixture();
    const v1 = await fixture.createRelease("release-v1", "1.0.0", "fail");
    const { host, origin } = await startEmptyHost(fixture.appsDir);

    await expect(
      host.registry.deploy("customer", {
        target: v1.definition,
        operationId: "first-release-not-ready",
        expectedCurrentReleaseId: null,
        readiness: {
          timeoutMs: 60,
          intervalMs: 5,
          successThreshold: 1,
        },
      }),
    ).rejects.toMatchObject({ code: "APP_READINESS_FAILED" });

    await waitForFile(v1.destroyedPath);
    expect(host.registry.has("customer")).toBe(false);
    expect(host.registry.snapshot("customer")).toBeUndefined();
    await expect(
      fetch(`${origin}/customer/api/version`),
    ).resolves.toMatchObject({ status: 404 });
  });

  it("loads the target from its real release directory and switches server and static assets together", async () => {
    const fixture = await createDeploymentFixture();
    const v1 = await fixture.createRelease("release-v1", "1.0.0", "ready");
    const v2 = await fixture.createRelease("release-v2", "2.0.0", "gate");
    const { host, origin } = await startHost(fixture.appsDir, v1.definition);

    await expect(fetchVersion(origin)).resolves.toBe("1.0.0");
    await expect(fetchAsset(origin)).resolves.toContain("1.0.0");

    const deployment = host.registry.deploy("customer", {
      target: v2.definition,
      operationId: "deploy-v2",
      expectedCurrentReleaseId: "release-v1",
      readiness: {
        timeoutMs: 2_000,
        intervalMs: 10,
        successThreshold: 1,
      },
    });

    await waitForFile(v2.startedPath);
    await expect(fetchVersion(origin)).resolves.toBe("1.0.0");
    await expect(fetchAsset(origin)).resolves.toContain("1.0.0");

    await writeFile(v2.readyPath, "ready");
    await expect(deployment).resolves.toMatchObject({
      id: "customer",
      operationId: "deploy-v2",
      previousReleaseId: "release-v1",
      activeReleaseId: "release-v2",
      changed: true,
      app: {
        releaseId: "release-v2",
        codeVersion: "2.0.0",
      },
    });

    await expect(fetchVersion(origin)).resolves.toBe("2.0.0");
    await expect(fetchAsset(origin)).resolves.toContain("2.0.0");
  });

  it("rejects a stale expected release before starting the target runtime", async () => {
    const fixture = await createDeploymentFixture();
    const v1 = await fixture.createRelease("release-v1", "1.0.0", "ready");
    const v2 = await fixture.createRelease("release-v2", "2.0.0", "ready");
    const { host, origin } = await startHost(fixture.appsDir, v1.definition);

    await expect(fetchVersion(origin)).resolves.toBe("1.0.0");

    await expect(
      host.registry.deploy("customer", {
        target: v2.definition,
        operationId: "stale-deploy",
        expectedCurrentReleaseId: "release-stale",
      }),
    ).rejects.toMatchObject({
      status: 409,
    });

    await expect(access(v2.startedPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(host.registry.definition("customer")?.release?.releaseId).toBe(
      "release-v1",
    );
    expect(host.registry.snapshot("customer")?.releaseId).toBe("release-v1");
  });

  it("accepts null CAS when restoring a registered release without an active runtime", async () => {
    const fixture = await createDeploymentFixture();
    const v1 = await fixture.createRelease("release-v1", "1.0.0", "ready");
    const { host } = await startHost(fixture.appsDir, v1.definition);

    expect(host.registry.snapshot("customer")).toBeUndefined();
    await expect(
      host.registry.deploy("customer", {
        target: v1.definition,
        operationId: "restore-v1",
        expectedCurrentReleaseId: null,
      }),
    ).resolves.toMatchObject({
      operationId: "restore-v1",
      previousReleaseId: null,
      activeReleaseId: "release-v1",
      changed: true,
      app: {
        releaseId: "release-v1",
      },
    });
  });

  it("keeps the old server and static binding when candidate readiness fails", async () => {
    const fixture = await createDeploymentFixture();
    const v1 = await fixture.createRelease("release-v1", "1.0.0", "ready");
    const v2 = await fixture.createRelease("release-v2", "2.0.0", "fail");
    const { host, origin } = await startHost(fixture.appsDir, v1.definition);

    await expect(fetchVersion(origin)).resolves.toBe("1.0.0");

    await expect(
      host.registry.deploy("customer", {
        target: v2.definition,
        operationId: "not-ready",
        expectedCurrentReleaseId: "release-v1",
        readiness: {
          timeoutMs: 60,
          intervalMs: 5,
          successThreshold: 1,
        },
      }),
    ).rejects.toBeDefined();

    await waitForFile(v2.destroyedPath);
    expect(host.registry.definition("customer")?.release?.releaseId).toBe(
      "release-v1",
    );
    expect(host.registry.snapshot("customer")?.releaseId).toBe("release-v1");
    await expect(fetchVersion(origin)).resolves.toBe("1.0.0");
    await expect(fetchAsset(origin)).resolves.toContain("1.0.0");
  });

  it("restores the old binding when post-switch validation fails", async () => {
    const fixture = await createDeploymentFixture();
    const v1 = await fixture.createRelease("release-v1", "1.0.0", "ready");
    const v2 = await fixture.createRelease(
      "release-v2",
      "2.0.0",
      "fail-after-ready",
    );
    const { host, origin } = await startHost(fixture.appsDir, v1.definition);

    await expect(fetchVersion(origin)).resolves.toBe("1.0.0");

    await expect(
      host.registry.deploy("customer", {
        target: v2.definition,
        operationId: "post-switch-failure",
        expectedCurrentReleaseId: "release-v1",
        readiness: {
          timeoutMs: 60,
          intervalMs: 5,
          successThreshold: 1,
        },
      }),
    ).rejects.toMatchObject({
      code: "APP_READINESS_FAILED",
    });

    await waitForFile(v2.destroyedPath);
    await expect(readFile(v2.destroyedPath, "utf8")).resolves.toBe("2");
    expect(host.registry.definition("customer")?.release?.releaseId).toBe(
      "release-v1",
    );
    expect(host.registry.snapshot("customer")?.releaseId).toBe("release-v1");
    await expect(access(v1.destroyedPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(fetchVersion(origin)).resolves.toBe("1.0.0");
    await expect(fetchAsset(origin)).resolves.toContain("1.0.0");
  });

  it("switches the binding before draining the old runtime and lets its in-flight request finish", async () => {
    const fixture = await createDeploymentFixture();
    const v1 = await fixture.createRelease("release-v1", "1.0.0", "ready");
    const v2 = await fixture.createRelease("release-v2", "2.0.0", "ready");
    const { host, origin } = await startHost(fixture.appsDir, v1.definition);

    await expect(fetchVersion(origin)).resolves.toBe("1.0.0");
    const heldRequest = fetch(`${origin}/customer/hold`).then(
      async (response) => (await response.json()) as { version: string },
    );
    await waitForFile(v1.holdStartedPath);

    let bindingAtDrain: { definition?: string; runtime?: string } | undefined;
    const draining = new Promise<void>((resolve) => {
      const unsubscribe = host.registry.events.on("app:draining", (event) => {
        if (event.version === 1) {
          bindingAtDrain = {
            definition:
              host.registry.definition("customer")?.release?.releaseId,
            runtime: host.registry.snapshot("customer")?.releaseId ?? undefined,
          };
          unsubscribe();
          resolve();
        }
      });
    });

    const deployment = host.registry.deploy("customer", {
      target: v2.definition,
      operationId: "drain-v1",
      expectedCurrentReleaseId: "release-v1",
      readiness: {
        timeoutMs: 1_000,
        intervalMs: 5,
        successThreshold: 1,
      },
    });

    await draining;
    try {
      expect(bindingAtDrain).toEqual({
        definition: "release-v2",
        runtime: "release-v2",
      });
      await expect(
        fetchVersion(origin, AbortSignal.timeout(500)),
      ).resolves.toBe("2.0.0");
      await expect(fetchAsset(origin)).resolves.toContain("2.0.0");
    } finally {
      await writeFile(v1.holdContinuePath, "continue");
    }

    await expect(heldRequest).resolves.toEqual({ version: "1.0.0" });
    await expect(deployment).resolves.toMatchObject({
      activeReleaseId: "release-v2",
    });
    await waitForFile(v1.destroyedPath);
  });

  it("rejects direct code definition replacement while a runtime is active", async () => {
    const fixture = await createDeploymentFixture();
    const v1 = await fixture.createRelease("release-v1", "1.0.0", "ready");
    const v2 = await fixture.createRelease("release-v2", "2.0.0", "ready");
    const { host, origin } = await startHost(fixture.appsDir, v1.definition);

    await expect(fetchVersion(origin)).resolves.toBe("1.0.0");

    await expect(
      host.registry.updateDefinition("customer", v2.definition),
    ).rejects.toMatchObject({
      status: 409,
    });
    expect(host.registry.definition("customer")?.release?.releaseId).toBe(
      "release-v1",
    );
    await expect(fetchVersion(origin)).resolves.toBe("1.0.0");
  });
});

type ReadinessBehavior = "ready" | "gate" | "fail" | "fail-after-ready";

interface ReleaseFixture {
  definition: AppDefinition;
  startedPath: string;
  readyPath: string;
  destroyedPath: string;
  holdStartedPath: string;
  holdContinuePath: string;
}

interface DeploymentFixture {
  appsDir: string;
  createRelease(
    releaseId: string,
    version: string,
    readiness: ReadinessBehavior,
  ): Promise<ReleaseFixture>;
}

async function createDeploymentFixture(): Promise<DeploymentFixture> {
  const appsDir = await mkdtemp(
    path.join(os.tmpdir(), "nocobase-app-deployment-"),
  );
  tempDirs.push(appsDir);
  const appRoot = path.join(appsDir, "customer");

  return {
    appsDir,
    async createRelease(releaseId, version, readiness) {
      const releaseDir = path.join(appRoot, "releases", releaseId);
      const serverDir = path.join(releaseDir, "dist", "server");
      const clientDir = path.join(releaseDir, "dist", "client");
      const assetsDir = path.join(clientDir, "assets");
      await mkdir(serverDir, { recursive: true });
      await mkdir(assetsDir, { recursive: true });
      await writeFile(
        path.join(releaseDir, "package.json"),
        JSON.stringify({ type: "module", version }),
      );
      await writeFile(
        path.join(assetsDir, "app.js"),
        `console.log(${JSON.stringify(version)});`,
      );
      await writeFile(
        path.join(serverDir, "embedded.js"),
        releaseModuleSource(version, readiness),
      );

      return {
        definition: {
          id: "customer",
          appName: "customer",
          basePath: "/customer",
          enabled: true,
          backend: "in-process",
          configVersion: "v1",
          isolation: "in-process",
          tier: "warm",
          desiredVersion: version,
          rootDir: releaseDir,
          dataDir: path.join(appRoot, "data"),
          client: {
            rootDir: clientDir,
            index: "index.html",
            assetsDir,
          },
          server: {
            rootDir: releaseDir,
            entrypoint: "dist/server/embedded.js",
            healthPath: "/healthz",
          },
          code: {
            version,
            rootDir: releaseDir,
            entrypoint: "dist/server/embedded.js",
          },
          release: {
            releaseId,
            version,
            rootDir: releaseDir,
            entrypoint: "dist/server/embedded.js",
            releaseDir,
          },
          healthPath: "/healthz",
        },
        startedPath: path.join(releaseDir, "started"),
        readyPath: path.join(releaseDir, "ready"),
        destroyedPath: path.join(releaseDir, "destroyed"),
        holdStartedPath: path.join(releaseDir, "hold-started"),
        holdContinuePath: path.join(releaseDir, "hold-continue"),
      };
    },
  };
}

function releaseModuleSource(
  version: string,
  readiness: ReadinessBehavior,
): string {
  return `
    import { access, writeFile } from "node:fs/promises";
    import path from "node:path";

    const version = ${JSON.stringify(version)};
    const readiness = ${JSON.stringify(readiness)};
    let healthChecks = 0;

    export async function createServer(scope) {
      await writeFile(path.join(scope.rootDir, "started"), "started");
      scope.registerDisposer("deployment-test", async () => {
        await writeFile(path.join(scope.rootDir, "destroyed"), String(healthChecks));
      });

      return {
        async fetch(request) {
          const pathname = new URL(request.url).pathname;
          if (pathname === "/healthz") {
            healthChecks += 1;
            if (readiness === "fail") {
              return Response.json({ ok: false, version }, { status: 503 });
            }
            if (readiness === "fail-after-ready" && healthChecks > 1) {
              return Response.json({ ok: false, version }, { status: 503 });
            }
            if (readiness === "gate") {
              try {
                await access(path.join(scope.rootDir, "ready"));
              } catch {
                return Response.json({ ok: false, version }, { status: 503 });
              }
            }
            return Response.json({ ok: true, version });
          }

          if (pathname === "/hold") {
            await writeFile(path.join(scope.rootDir, "hold-started"), "started");
            while (true) {
              try {
                await access(path.join(scope.rootDir, "hold-continue"));
                break;
              } catch {
                await new Promise((resolve) => setTimeout(resolve, 5));
              }
            }
          }

          return Response.json({ version });
        },
      };
    }
  `;
}

async function startHost(
  appsDir: string,
  definition: AppDefinition,
): Promise<{ host: AppHost; origin: string }> {
  const result = await startEmptyHost(appsDir);
  await result.host.registry.register(definition.id, definition);
  return result;
}

async function startEmptyHost(
  appsDir: string,
): Promise<{ host: AppHost; origin: string }> {
  const host = createAppHost({
    host: "127.0.0.1",
    port: 0,
    appDistDir: appsDir,
    idleTtlMs: 60_000,
  });
  runningHosts.push(host);
  await host.start();

  const address = host.server.address();
  if (!address || typeof address !== "object") {
    throw new Error("App host did not expose a TCP address");
  }

  return {
    host,
    origin: `http://127.0.0.1:${address.port}`,
  };
}

async function fetchVersion(
  origin: string,
  signal?: AbortSignal,
): Promise<string> {
  const response = await fetch(`${origin}/customer/api/version`, { signal });
  const body = (await response.json()) as { version: string };
  return body.version;
}

async function fetchAsset(origin: string): Promise<string> {
  const response = await fetch(`${origin}/customer/assets/app.js`);
  return response.text();
}

async function waitForFile(filePath: string, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await access(filePath);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }

  throw new Error(`Timed out waiting for ${filePath}`);
}
