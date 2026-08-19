/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";

import { createAppHost, type AppHost } from "../dist/index.js";

const tempDirs: string[] = [];
const runningHosts: AppHost[] = [];

afterEach(async () => {
  for (const host of runningHosts.splice(0)) {
    await host.close();
  }

  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

async function createUpgradeFixtureApp(appsDir: string, id: string): Promise<void> {
  const appRoot = path.join(appsDir, id);
  await mkdir(path.join(appRoot, "dist", "client", "assets"), { recursive: true });
  await mkdir(path.join(appRoot, "dist", "server"), { recursive: true });
  await writeFile(
    path.join(appRoot, "package.json"),
    JSON.stringify({
      name: `@example/${id}-app`,
      version: "1.2.3",
      type: "module",
    }),
  );
  await writeFile(
    path.join(appRoot, "dist", "client", "index.html"),
    `<!doctype html><html><body><main>${id}</main></body></html>`,
  );
  await writeFile(
    path.join(appRoot, "dist", "server", "embedded.js"),
    `
      import { createHash } from "node:crypto";

      export function createServer(scope) {
        const sockets = new Set();
        return {
          async fetch() {
            return new Response("ok");
          },
          async close() {
            for (const socket of sockets) {
              socket.destroy();
            }
          },
          handleUpgrade(request, socket, head) {
            sockets.add(socket);
            socket.on("close", () => sockets.delete(socket));
            const url = new URL(request.url, "http://localhost");
            const livePath = scope.basePath + "/live";
            if (url.pathname !== livePath) {
              socket.destroy();
              return;
            }
            const key = request.headers["sec-websocket-key"];
            const accept = createHash("sha1")
              .update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
              .digest("base64");
            socket.write(
              "HTTP/1.1 101 Switching Protocols\\r\\n" +
                "Upgrade: websocket\\r\\n" +
                "Connection: Upgrade\\r\\n" +
                "Sec-WebSocket-Accept: " +
                accept +
                "\\r\\n\\r\\n",
            );
            const payload = JSON.stringify({ pathname: url.pathname, basePath: scope.basePath });
            const frame = Buffer.concat([
              Buffer.from([0x81, payload.length]),
              Buffer.from(payload, "utf8"),
            ]);
            socket.write(frame);
          },
        };
      }
    `,
  );
}

async function createUpgradeHost(): Promise<AppHost> {
  const appsDir = await mkdtemp(path.join(os.tmpdir(), "nocobase-app-host-upgrade-"));
  tempDirs.push(appsDir);
  await createUpgradeFixtureApp(appsDir, "customer");

  const host = createAppHost({
    host: "127.0.0.1",
    port: 0,
    appDistDir: appsDir,
    idleTtlMs: 60_000,
  });
  runningHosts.push(host);
  await host.start();
  return host;
}

function connectUpgrade(port: number, pathname: string): Promise<{ data: Buffer; closed: boolean }> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, "127.0.0.1");
    const chunks: Buffer[] = [];
    let closed = false;
    const settled = (): void => {
      clearTimeout(timer);
      socket.removeAllListeners();
      socket.destroy();
      resolve({ data: Buffer.concat(chunks), closed });
    };
    const timer = setTimeout(() => settled(), 5000);
    socket.on("data", (chunk) => {
      chunks.push(chunk as Buffer);
      const buffer = Buffer.concat(chunks);
      const headerEnd = buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) {
        return;
      }
      const frame = buffer.subarray(headerEnd + 4);
      if (frame.length >= 2 && frame[0] === 0x81) {
        settled();
      }
    });
    socket.on("close", () => {
      closed = true;
      settled();
    });
    socket.on("error", (error) => {
      reject(error);
    });
    socket.on("connect", () => {
      socket.write(
        `GET ${pathname} HTTP/1.1\r\n` +
          "Host: 127.0.0.1\r\n" +
          "Upgrade: websocket\r\n" +
          "Connection: Upgrade\r\n" +
          "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n" +
          "Sec-WebSocket-Version: 13\r\n" +
          "\r\n",
      );
    });
  });
}

it("routes WebSocket upgrades to the app handleUpgrade with the raw path", async () => {
  const host = await createUpgradeHost();
  const address = host.server.address();
  if (!address || typeof address !== "object") {
    throw new Error("App host did not expose a TCP address");
  }

  const result = await connectUpgrade(address.port, "/customer/live");
  expect(result.data.toString("utf8")).toContain("HTTP/1.1 101 Switching Protocols");
  expect(result.data.toString("utf8")).toContain("Sec-WebSocket-Accept:");

  const headerEnd = result.data.indexOf("\r\n\r\n");
  const frame = result.data.subarray(headerEnd + 4);
  expect(frame[0]).toBe(0x81);
  expect(frame[1]).toBeGreaterThan(0);
  expect(JSON.parse(frame.subarray(2).toString("utf8"))).toEqual({
    pathname: "/customer/live",
    basePath: "/customer",
  });
});

it("destroys upgrade sockets for unknown apps", async () => {
  const host = await createUpgradeHost();
  const address = host.server.address();
  if (!address || typeof address !== "object") {
    throw new Error("App host did not expose a TCP address");
  }

  const result = await connectUpgrade(address.port, "/unknown/live");
  expect(result.data.toString("utf8")).toBe("");
  expect(result.closed).toBe(true);
});

it("destroys upgrade sockets that do not target the live path inside the app", async () => {
  const host = await createUpgradeHost();
  const address = host.server.address();
  if (!address || typeof address !== "object") {
    throw new Error("App host did not expose a TCP address");
  }

  const result = await connectUpgrade(address.port, "/customer/other");
  expect(result.data.toString("utf8")).toBe("");
  expect(result.closed).toBe(true);
});
