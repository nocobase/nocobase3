import { expect, it } from "vitest";

import { authProvider } from "../src/auth/index.ts";
import {
  authSession,
  getNocoBaseErrorDetail,
  isNocoBaseLifecycleError,
  isNocoBaseServiceError,
  NocoBaseClient,
  NocoBaseWebSocketClient,
  normalizeNocoBaseRuntimeError,
  resolveNocoBaseWebSocketUrl,
} from "../src/client/index.ts";
import { portalRuntimeStore } from "../src/runtime/index.ts";

const jsonResponse = (status, payload) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json",
      "x-request-id": `request-${status}`,
    },
  });

it("runtime errors preserve server codes and authentication state", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  try {
    expect(
      getNocoBaseErrorDetail({ error: { code: "APP_COMMANDING" } })?.code
    ).toBe("APP_COMMANDING");
    expect(
      getNocoBaseErrorDetail({ errors: [{ code: "ROLE_NOT_FOUND_ERR" }] })?.code
    ).toBe("ROLE_NOT_FOUND_ERR");
    expect(isNocoBaseLifecycleError({ code: "APP_PREPARING" })).toBe(true);
    expect(isNocoBaseServiceError({ status: 504 })).toBe(true);
    expect(isNocoBaseServiceError({ status: 401 })).toBe(false);
    expect(
      normalizeNocoBaseRuntimeError(
        { code: "APP_STOPPED", status: 503, message: "stopped" },
        "websocket"
      )
    ).toEqual({
        code: "APP_STOPPED",
        status: 503,
        message: "stopped",
        payload: { code: "APP_STOPPED", status: 503, message: "stopped" },
        source: "websocket",
      });

    authSession.clearAuthentication();
    globalThis.window = {
      location: { origin: "https://example.com" },
      NOCOBASE_API_URL: "https://example.com/api",
    } as Window & typeof globalThis;
    globalThis.fetch = async () =>
      jsonResponse(200, { data: { token: "role-token" } });
    await expect(
      authProvider.login({ account: "tester", password: "secret" })
    ).resolves.toEqual({ success: true, redirectTo: "/" });
    authSession.set("role", "deleted-role");
    const roles = [];
    globalThis.fetch = async (_url, options) => {
      roles.push(options.headers["X-Role"]);
      if (roles.length === 1) {
        return jsonResponse(401, {
          errors: [{ code: "ROLE_NOT_FOUND_FOR_USER", message: "stale role" }],
        });
      }
      return jsonResponse(200, { data: { id: 1, username: "tester" } });
    };

    await expect(authProvider.check()).resolves.toEqual({ authenticated: true });
    expect(authSession.get("token")).toBe("role-token");
    expect(authSession.get("role")).toBeUndefined();
    expect(roles).toEqual(["deleted-role", undefined]);

    authSession.set("token", "maintenance-token");
    portalRuntimeStore.clear();
    globalThis.fetch = async () =>
      jsonResponse(503, {
        error: {
          code: "APP_PREPARING",
          maintaining: true,
          message: "preparing",
          status: 503,
        },
      });

    await expect(authProvider.check()).resolves.toEqual({ authenticated: true });
    expect(authSession.get("token")).toBe("maintenance-token");
    expect(portalRuntimeStore.getState().error?.code).toBe("APP_PREPARING");

    authSession.set("token", "no-role-token");
    portalRuntimeStore.clear();
    globalThis.fetch = async () =>
      jsonResponse(401, {
        errors: [
          {
            code: "USER_HAS_NO_ROLES_ERR",
            message: "no roles",
          },
        ],
      });

    await expect(authProvider.check()).resolves.toEqual({ authenticated: true });
    expect(authSession.get("token")).toBe("no-role-token");
    expect(portalRuntimeStore.getState().error?.code).toBe(
      "USER_HAS_NO_ROLES_ERR"
    );

    authSession.set("token", "invalid-token");
    portalRuntimeStore.clear();
    globalThis.fetch = async () =>
      jsonResponse(400, {
        errors: [{ code: "INVALID_TOKEN", message: "invalid token" }],
      });

    await expect(authProvider.check()).resolves.toEqual({
      authenticated: false,
      redirectTo: "/login",
    });
    expect(authSession.get("token")).toBeUndefined();
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
    authSession.clearAuthentication();
    portalRuntimeStore.clear();
  }
});

it("the WebSocket URL preserves the server prefix and selects a sub-application", () => {
  const originalWindow = globalThis.window;
  try {
    globalThis.window = {
      location: { origin: "https://example.com" },
      NOCOBASE_API_URL: "https://example.com/nocobase/api/__app/crm",
      NOCOBASE_PORTAL_BASE: "/nocobase/x/apps/crm/customer/",
    };
    expect(resolveNocoBaseWebSocketUrl()).toBe(
      "wss://example.com/nocobase/ws?__appName=crm"
    );
  } finally {
    globalThis.window = originalWindow;
  }
});

it("a stale WebSocket cannot disrupt its replacement", () => {
  const originalWebSocket = globalThis.WebSocket;
  const originalWindow = globalThis.window;
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const sockets = [];
  const sentMessages = [];
  const intervals = new Set();
  const timeouts = new Set();
  let timerId = 0;

  class MockWebSocket {
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      sockets.push(this);
    }

    close() {
      this.readyState = 2;
    }

    open() {
      this.readyState = 1;
      this.onopen?.();
    }

    finishClose() {
      this.readyState = 3;
      this.onclose?.();
    }

    message(value) {
      this.onmessage?.({ data: JSON.stringify(value) });
    }

    send(message) {
      sentMessages.push(JSON.parse(message));
    }
  }

  try {
    authSession.clearAuthentication();
    authSession.set("token", "socket-token");
    authSession.set("auth", "basic");
    globalThis.window = {
      location: { origin: "https://example.com" },
      NOCOBASE_API_URL: "https://example.com/api",
    };
    globalThis.WebSocket = MockWebSocket;
    globalThis.setInterval = () => {
      const id = ++timerId;
      intervals.add(id);
      return id;
    };
    globalThis.clearInterval = (id) => intervals.delete(id);
    globalThis.setTimeout = () => {
      const id = ++timerId;
      timeouts.add(id);
      return id;
    };
    globalThis.clearTimeout = (id) => timeouts.delete(id);

    const messages = [];
    const client = new NocoBaseWebSocketClient();
    client.subscribe((message) => messages.push(message));
    client.connect();
    sockets[0].open();
    expect(sentMessages.at(-1)).toEqual({
      type: "auth:token",
      payload: { token: "socket-token", authenticator: "basic" },
    });
    client.authenticate();
    expect(sentMessages.at(-1)).toEqual({
      type: "auth:token",
      payload: { token: "socket-token", authenticator: "basic" },
    });
    expect(sentMessages).toHaveLength(2);
    client.reconnect();
    sockets[1].open();

    sockets[0].message({ type: "maintaining", payload: { code: "APP_ERROR" } });
    sockets[0].finishClose();
    expect(intervals.size).toBe(1);
    expect(timeouts.size).toBe(0);
    expect(messages).toEqual([]);

    sockets[1].message({ type: "maintaining", payload: { code: "APP_STOPPED" } });
    expect(messages[0]?.payload?.code).toBe("APP_STOPPED");
    client.close();
  } finally {
    globalThis.WebSocket = originalWebSocket;
    globalThis.window = originalWindow;
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
    authSession.clearAuthentication();
    portalRuntimeStore.clear();
  }
});

it("only explicit application lifecycle responses become global runtime states", async () => {
  const originalFetch = globalThis.fetch;
  const client = new NocoBaseClient("https://example.com/api");

  try {
    portalRuntimeStore.clear();
    globalThis.fetch = async () =>
      jsonResponse(504, { message: "report timed out" });

    await expect(client.request("reports:run")).rejects.toThrow();
    expect(portalRuntimeStore.getState().error).toBeUndefined();

    globalThis.fetch = async () =>
      jsonResponse(503, {
        error: {
          code: "APP_PREPARING",
          maintaining: true,
          message: "application demo is preparing",
          status: 503,
        },
      });

    await expect(client.request("reports:run")).rejects.toThrow();
    expect(portalRuntimeStore.getState().error?.code).toBe("APP_PREPARING");
    expect(portalRuntimeStore.getState().error?.status).toBe(503);
  } finally {
    globalThis.fetch = originalFetch;
    portalRuntimeStore.clear();
  }
});
