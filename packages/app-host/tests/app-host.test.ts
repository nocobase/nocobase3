import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it } from "vitest";

import { createAppHost, type AppHost } from "../dist/index.js";

const tempDirs: string[] = [];
const runningHosts: AppHost[] = [];

afterEach(async () => {
  await Promise.all(runningHosts.splice(0).map((host) => host.close("test cleanup")));
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

it("dispatches non-asset requests to the embedded server with the app mount stripped", async () => {
  const appsDir = await mkdtemp(path.join(os.tmpdir(), "nocobase-app-host-"));
  tempDirs.push(appsDir);

  const appRoot = path.join(appsDir, "customer");
  await mkdir(path.join(appRoot, "dist", "client", "assets"), { recursive: true });
  await mkdir(path.join(appRoot, "dist", "server"), { recursive: true });
  await writeFile(
    path.join(appRoot, "package.json"),
    JSON.stringify({
      name: "@example/customer-app",
      version: "1.2.3",
      type: "module",
    }),
  );
  await writeFile(
    path.join(appRoot, "dist", "client", "index.html"),
    `<!doctype html><html><body><main>Customer App</main><script type="module" src="/assets/app.js"></script></body></html>`,
  );
  await writeFile(path.join(appRoot, "dist", "client", "assets", "app.js"), `console.log("customer");`);
  await writeFile(
    path.join(appRoot, "dist", "server", "embedded.js"),
    `
      import { readFile } from "node:fs/promises";
      import path from "node:path";

      export function createServer(scope) {
        return {
          async fetch(request) {
            const url = new URL(request.url);
            if (url.pathname === "/") {
              const html = await readFile(path.join(scope.clientDir, "index.html"), "utf8");
              return new Response(html.replaceAll('"/assets/', '"' + scope.assetsBasePath + "/"), {
                headers: { "content-type": "text/html; charset=utf-8" },
              });
            }

            return Response.json({
              id: scope.id,
              basePath: scope.basePath,
              assetsBasePath: scope.assetsBasePath,
              clientDir: scope.clientDir,
              pathname: url.pathname,
              search: url.search,
            });
          },
        };
      }
    `,
  );

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

  const response = await fetch(`http://127.0.0.1:${address.port}/customer/api/hello?x=1`);
  await expect(response.json()).resolves.toMatchObject({
    id: "customer",
    basePath: "/customer",
    assetsBasePath: "/customer/assets",
    pathname: "/api/hello",
    search: "?x=1",
  });

  const page = await fetch(`http://127.0.0.1:${address.port}/customer/`);
  const pageHtml = await page.text();
  expect(pageHtml).toContain("Customer App");
  expect(pageHtml).toContain("/customer/assets/app.js");

  const asset = await fetch(`http://127.0.0.1:${address.port}/customer/assets/app.js`);
  expect(asset.headers.get("cache-control")).toContain("immutable");
  await expect(asset.text()).resolves.toContain("customer");
});

it("does not discover a client-only app without a server artifact", async () => {
  const appsDir = await mkdtemp(path.join(os.tmpdir(), "nocobase-app-host-client-"));
  tempDirs.push(appsDir);

  const appRoot = path.join(appsDir, "customer");
  await mkdir(path.join(appRoot, "dist", "client", "assets"), { recursive: true });
  await writeFile(
    path.join(appRoot, "package.json"),
    JSON.stringify({
      name: "@example/customer-app",
      version: "1.2.3",
      type: "module",
    }),
  );
  await writeFile(path.join(appRoot, "dist", "client", "index.html"), `<!doctype html><main>Client only</main>`);
  await writeFile(path.join(appRoot, "dist", "client", "assets", "app.js"), `console.log("client-only");`);

  const host = createAppHost({
    host: "127.0.0.1",
    port: 0,
    appDistDir: appsDir,
    idleTtlMs: 60_000,
  });
  runningHosts.push(host);
  await host.start();

  expect(host.registry.listDefinitions()).toEqual([]);

  const address = host.server.address();
  if (!address || typeof address !== "object") {
    throw new Error("App host did not expose a TCP address");
  }

  const root = await fetch(`http://127.0.0.1:${address.port}/customer/`);
  expect(root.status).toBe(404);
});

it("serves a server-only app from dist/server/embedded.js", async () => {
  const appsDir = await mkdtemp(path.join(os.tmpdir(), "nocobase-app-host-server-"));
  tempDirs.push(appsDir);

  const appRoot = path.join(appsDir, "customer");
  await mkdir(path.join(appRoot, "dist", "server"), { recursive: true });
  await writeFile(
    path.join(appRoot, "package.json"),
    JSON.stringify({
      name: "@example/customer-app",
      version: "1.2.3",
      type: "module",
    }),
  );
  await writeFile(
    path.join(appRoot, "dist", "server", "embedded.js"),
    `
      export function createServer(scope) {
        return {
          fetch(request) {
            const url = new URL(request.url);
            return Response.json({
              id: scope.id,
              basePath: scope.basePath,
              pathname: url.pathname,
            });
          },
        };
      }
    `,
  );

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

  const api = await fetch(`http://127.0.0.1:${address.port}/customer/api/info`);
  await expect(api.json()).resolves.toEqual({
    id: "customer",
    basePath: "/customer",
    pathname: "/api/info",
  });

  const page = await fetch(`http://127.0.0.1:${address.port}/customer/dashboard`);
  await expect(page.json()).resolves.toEqual({
    id: "customer",
    basePath: "/customer",
    pathname: "/dashboard",
  });
});

it("reserves /assets for static files and does not fall through to the server", async () => {
  const appsDir = await mkdtemp(path.join(os.tmpdir(), "nocobase-app-host-assets-"));
  tempDirs.push(appsDir);

  const appRoot = path.join(appsDir, "customer");
  await mkdir(path.join(appRoot, "dist", "client", "assets"), { recursive: true });
  await mkdir(path.join(appRoot, "dist", "server"), { recursive: true });
  await writeFile(
    path.join(appRoot, "package.json"),
    JSON.stringify({
      name: "@example/customer-app",
      version: "1.2.3",
      type: "module",
    }),
  );
  await writeFile(path.join(appRoot, "dist", "client", "assets", "app.js"), `console.log("asset");`);
  await writeFile(
    path.join(appRoot, "dist", "server", "embedded.js"),
    `
      export function createServer() {
        return {
          fetch(request) {
            const url = new URL(request.url);
            return Response.json({ handledByServer: true, pathname: url.pathname });
          },
        };
      }
    `,
  );

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

  const missingAsset = await fetch(`http://127.0.0.1:${address.port}/customer/assets/missing.js`);
  expect(missingAsset.status).toBe(404);
  await expect(missingAsset.json()).resolves.toMatchObject({ error: "Not found" });

  const postAsset = await fetch(`http://127.0.0.1:${address.port}/customer/assets/app.js`, { method: "POST" });
  expect(postAsset.status).toBe(405);

  const serverRoute = await fetch(`http://127.0.0.1:${address.port}/customer/static/app.js`);
  await expect(serverRoute.json()).resolves.toEqual({
    handledByServer: true,
    pathname: "/static/app.js",
  });
});

it("serves the packaged app-dist fixture", async () => {
  const appsDir = fileURLToPath(new URL("../fixtures/app-dist", import.meta.url));
  const host = createAppHost({
    host: "127.0.0.1",
    port: 0,
    appDistDir: appsDir,
    idleTtlMs: 60_000,
  });
  runningHosts.push(host);
  await host.start();

  expect(host.registry.listDefinitions().map((definition) => definition.id)).toEqual(["demo", "hub", "service"]);

  const address = host.server.address();
  if (!address || typeof address !== "object") {
    throw new Error("App host did not expose a TCP address");
  }

  const root = await fetch(`http://127.0.0.1:${address.port}/demo/`);
  const rootHtml = await root.text();
  expect(rootHtml).toContain("Demo App");
  expect(rootHtml).toContain("/demo/assets/demo.js");

  const asset = await fetch(`http://127.0.0.1:${address.port}/demo/assets/demo.js`);
  await expect(asset.text()).resolves.toContain("demo fixture");

  const api = await fetch(`http://127.0.0.1:${address.port}/demo/api/info`);
  await expect(api.json()).resolves.toMatchObject({
    id: "demo",
    basePath: "/demo",
    requestPath: "/api/info",
  });

  const service = await fetch(`http://127.0.0.1:${address.port}/service/healthz`);
  await expect(service.json()).resolves.toMatchObject({
    id: "service",
    requestPath: "/healthz",
  });
});

it("serves health information without discovered apps", async () => {
  const appsDir = await mkdtemp(path.join(os.tmpdir(), "nocobase-app-host-empty-"));
  tempDirs.push(appsDir);

  const host = createAppHost({
    host: "127.0.0.1",
    port: 0,
    appDistDir: appsDir,
  });
  runningHosts.push(host);
  await host.start();

  const address = host.server.address();
  if (!address || typeof address !== "object") {
    throw new Error("App host did not expose a TCP address");
  }

  const response = await fetchJson(new URL(`http://127.0.0.1:${address.port}/__health`));
  expect(response.registered).toBe(0);
  expect(response.activeTotal).toBe(0);
});

it("exposes app management through /__apps", async () => {
  const appsDir = await mkdtemp(path.join(os.tmpdir(), "nocobase-app-host-management-"));
  tempDirs.push(appsDir);

  const host = createAppHost({
    host: "127.0.0.1",
    port: 0,
    appDistDir: appsDir,
  });
  runningHosts.push(host);
  await host.start();

  const address = host.server.address();
  if (!address || typeof address !== "object") {
    throw new Error("App host did not expose a TCP address");
  }

  const apps = await fetchJson(new URL(`http://127.0.0.1:${address.port}/__apps`));
  expect(apps).toEqual({
    active: [],
    definitions: [],
  });
});

function fetchJson(url: URL): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    http
      .get(url, (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        response.on("end", () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>);
          } catch (error) {
            reject(error);
          }
        });
      })
      .once("error", reject);
  });
}
