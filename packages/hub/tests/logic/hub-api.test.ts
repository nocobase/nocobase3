// @vitest-environment node

import { afterEach, describe, expect, it } from "vitest";
import { createServer as createHttpServer, type Server } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createApp } from "../../server/index.ts";

const servers: Server[] = [];
const envSnapshot = new Map<string, string | undefined>();

afterEach(async () => {
  for (const [key, value] of envSnapshot) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  envSnapshot.clear();

  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
});

function setEnv(key: string, value: string): void {
  if (!envSnapshot.has(key)) {
    envSnapshot.set(key, process.env[key]);
  }
  process.env[key] = value;
}

describe("Hub API", () => {
  it("does not register a legacy proxy by default", async () => {
    const upstream = await startHttpStub((_request, response) => {
      response.statusCode = 200;
      response.end("upstream");
    });
    const app = createApp({
      appName: "hub",
      basePath: "/hub",
      nocoBaseApiUrl: upstream,
    });

    const response = await app.request("http://localhost/hub/v2/api/ping");

    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain("upstream");
  });

  it("enables a proxy only when target and path are explicit", async () => {
    const upstream = await startHttpStub((_request, response) => {
      response.statusCode = 200;
      response.setHeader("content-type", "text/plain");
      response.end(`proxied:${_request.url}`);
    });
    const app = createApp({
      appName: "hub",
      basePath: "/hub",
      apiProxyPath: "/hub/legacy-api",
      nocoBaseApiUrl: upstream,
    });

    const response = await app.request(
      "http://localhost/hub/legacy-api/ping?ok=1",
    );

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("proxied:/ping?ok=1");
  });

  it("supports owner setup and sign-in from the default loopback browser origin", async () => {
    setEnv("HUB_DATABASE_PATH", ":memory:");
    setEnv("AUTH_SECRET", "hub-test-secret-that-is-at-least-32-characters");
    const browserOrigin = "http://127.0.0.1:13210";

    const app = createApp({
      appName: "hub",
      basePath: "/hub",
      nocoBaseApiUrl: false,
    });

    const setupBefore = await app.request(
      `${browserOrigin}/hub/api/setup/status`,
    );
    expect(setupBefore.status).toBe(200);
    await expect(setupBefore.json()).resolves.toMatchObject({
      data: { setupRequired: true },
      meta: expect.any(Object),
      requestId: expect.any(String),
    });

    const owner = await app.request(`${browserOrigin}/hub/api/setup/owner`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: browserOrigin,
      },
      body: JSON.stringify({
        email: "owner@example.com",
        password: "correct horse battery staple",
        name: "Hub Owner",
        username: "owner",
      }),
    });
    expect(owner.status).toBe(201);
    await expect(owner.json()).resolves.toMatchObject({
      data: { user: { email: "owner@example.com" } },
      requestId: expect.any(String),
    });

    const setupAfter = await app.request(
      `${browserOrigin}/hub/api/setup/status`,
    );
    await expect(setupAfter.json()).resolves.toMatchObject({
      data: { setupRequired: false },
    });

    const missingOrigin = await app.request(`${browserOrigin}/hub/api/apps`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ slug: "missing-origin", name: "Missing Origin" }),
    });
    expect(missingOrigin.status).toBe(403);

    const crossSiteSetup = createApp({
      appName: "hub",
      basePath: "/hub",
      nocoBaseApiUrl: false,
      databasePath: ":memory:",
      authSecret: "hub-cross-site-secret-that-is-at-least-32-characters",
    });
    const evilSetup = await crossSiteSetup.request(
      `${browserOrigin}/hub/api/setup/owner`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://evil.example.com",
          "sec-fetch-site": "cross-site",
        },
        body: JSON.stringify({
          email: "evil@example.com",
          password: "correct horse battery staple",
          name: "Evil Owner",
        }),
      },
    );
    expect(evilSetup.status).toBe(403);
    const textSetup = await crossSiteSetup.request(
      `${browserOrigin}/hub/api/setup/owner`,
      {
        method: "POST",
        headers: {
          "content-type": "text/plain",
          origin: browserOrigin,
        },
        body: JSON.stringify({
          email: "text@example.com",
          password: "correct horse battery staple",
          name: "Text Owner",
        }),
      },
    );
    expect(textSetup.status).toBe(415);
    await crossSiteSetup.close?.();

    const unauthenticated = await app.request(`${browserOrigin}/hub/api/apps`);
    expect(unauthenticated.status).toBe(401);
    await expect(unauthenticated.json()).resolves.toMatchObject({
      error: { code: "UNAUTHORIZED" },
      requestId: expect.any(String),
    });

    const untrustedSignIn = await app.request(
      `${browserOrigin}/hub/api/auth/sign-in/email`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://untrusted.example.com",
          "sec-fetch-site": "cross-site",
          "sec-fetch-mode": "cors",
          "sec-fetch-dest": "empty",
        },
        body: JSON.stringify({
          email: "owner@example.com",
          password: "correct horse battery staple",
        }),
      },
    );
    expect(untrustedSignIn.status).toBe(403);

    const signIn = await app.request(
      `${browserOrigin}/hub/api/auth/sign-in/email`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: browserOrigin,
          "sec-fetch-site": "same-origin",
          "sec-fetch-mode": "cors",
          "sec-fetch-dest": "empty",
        },
        body: JSON.stringify({
          email: "owner@example.com",
          password: "correct horse battery staple",
        }),
      },
    );
    expect(signIn.status).toBe(200);
    const cookie = signIn.headers.get("set-cookie");
    expect(cookie).toBeTruthy();

    const apps = await app.request(`${browserOrigin}/hub/api/apps`, {
      headers: { cookie: cookie ?? "" },
    });
    expect(apps.status).toBe(200);
    await expect(apps.json()).resolves.toMatchObject({
      data: [],
      meta: { total: 0 },
      requestId: expect.any(String),
    });

    const invalidApplication = await app.request(
      `${browserOrigin}/hub/api/apps`,
      {
        method: "POST",
        headers: {
          cookie: cookie ?? "",
          "content-type": "application/json",
          origin: browserOrigin,
        },
        body: JSON.stringify({ name: "Missing slug" }),
      },
    );
    expect(invalidApplication.status).toBe(422);
    await expect(invalidApplication.json()).resolves.toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
        issues: [
          {
            path: "slug",
            code: "required",
            message: "slug is required.",
          },
        ],
      },
      requestId: expect.any(String),
    });

    const siblingOrigin = await app.request(`${browserOrigin}/hub/api/apps`, {
      method: "POST",
      headers: {
        cookie: cookie ?? "",
        "content-type": "application/json",
        origin: "http://127.0.0.1:13211",
        "sec-fetch-site": "same-site",
      },
      body: JSON.stringify({ slug: "sibling", name: "Sibling" }),
    });
    expect(siblingOrigin.status).toBe(403);

    const textMutation = await app.request(`${browserOrigin}/hub/api/apps`, {
      method: "POST",
      headers: {
        cookie: cookie ?? "",
        "content-type": "text/plain",
        origin: browserOrigin,
      },
      body: JSON.stringify({ slug: "text", name: "Text" }),
    });
    expect(textMutation.status).toBe(415);

    const loopbackAlias = await app.request(
      "http://localhost:13210/hub/api/apps",
      {
        method: "POST",
        headers: {
          cookie: cookie ?? "",
          "content-type": "application/json",
          origin: "http://127.0.0.1:13210",
        },
        body: JSON.stringify({
          slug: "loopback-alias",
          name: "Loopback Alias",
        }),
      },
    );
    expect(loopbackAlias.status).toBe(201);
  });

  it("uses the configured public origin instead of client-supplied forwarded headers", async () => {
    const app = createApp({
      appName: "hub",
      basePath: "/hub",
      nocoBaseApiUrl: false,
      databasePath: ":memory:",
      authSecret: "hub-forwarded-origin-secret-at-least-32-characters",
      authBaseUrl: "https://hub.example.com/hub/api/auth",
    });
    const response = await app.request(
      "http://127.0.0.1:13000/hub/api/setup/owner",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://hub.example.com",
        },
        body: JSON.stringify({
          email: "forwarded@example.com",
          password: "correct horse battery staple",
          name: "Forwarded Owner",
        }),
      },
    );

    expect(response.status).toBe(201);

    const spoofed = await app.request(
      "http://127.0.0.1:13000/hub/api/setup/owner",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://evil.example.com",
          "x-forwarded-host": "evil.example.com",
          "x-forwarded-proto": "https",
        },
        body: JSON.stringify({
          email: "spoofed@example.com",
          password: "correct horse battery staple",
          name: "Spoofed Owner",
        }),
      },
    );
    expect(spoofed.status).toBe(403);
    await expect(spoofed.json()).resolves.toMatchObject({
      error: { code: "UNTRUSTED_ORIGIN" },
    });
    await app.close?.();
  });

  it("does not expose unexpected server error details", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "hub-error-envelope-"));
    const blockedParent = path.join(directory, "not-a-directory");
    await writeFile(blockedParent, "file");
    const app = createApp({
      appName: "hub",
      basePath: "/hub",
      nocoBaseApiUrl: false,
      databasePath: path.join(blockedParent, "hub.sqlite"),
      authSecret: "hub-error-envelope-secret-at-least-32-characters",
    });

    try {
      const response = await app.request("http://localhost/hub/api/healthz");
      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toMatchObject({
        error: {
          code: "INTERNAL_ERROR",
          message: "An unexpected internal error occurred.",
        },
      });
    } finally {
      await app.close?.();
      await rm(directory, { recursive: true, force: true });
    }
  });
});

function startHttpStub(
  handler: Parameters<typeof createHttpServer>[0],
): Promise<string> {
  const server = createHttpServer(handler);
  servers.push(server);

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to resolve stub address."));
        return;
      }
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}
