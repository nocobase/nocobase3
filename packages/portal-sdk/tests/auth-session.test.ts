import { afterEach, describe, expect, it } from "vitest";

import { AuthSession, NocoBaseClient } from "../src/client/index.ts";
import {
  resolveNocoBaseAppName,
  resolveNocoBasePortalName,
  resolveNocoBaseSettingsUrl,
  resolvePortalUrl,
} from "../src/runtime/index.ts";

const createStorage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
};

const originalWindow = globalThis.window;

afterEach(() => {
  if (originalWindow === undefined) {
    Reflect.deleteProperty(globalThis, "window");
  } else {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
  }
});

describe("Portal authentication session", () => {
  it("resolves main applications, sub-applications, and Portal names", () => {
    expect(
      resolveNocoBaseAppName(
        "/nocobase/x/apps/crm/customer/",
        "/nocobase/api/__app/crm"
      )
    ).toBe("crm");
    expect(
      resolveNocoBaseAppName("/x/customer/", "/api/__app/analytics")
    ).toBe("analytics");
    expect(resolveNocoBaseAppName("/x/customer/", "/api")).toBe("main");
    expect(resolveNocoBasePortalName("/x/hub/")).toBe("hub");
    expect(
      resolveNocoBasePortalName("/nocobase/x/apps/demo6/hub/")
    ).toBe("hub");
    expect(resolveNocoBasePortalName("/")).toBeUndefined();
  });

  it("builds runtime URLs and request headers from the active Portal", () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        location: { origin: "http://localhost:14000" },
        NOCOBASE_API_URL: "/api",
        NOCOBASE_PORTAL_BASE: "/x/demo/",
      },
    });

    expect(resolvePortalUrl("/users?tab=active#list")).toBe(
      "/x/demo/users?tab=active#list"
    );
    expect(resolveNocoBaseSettingsUrl()).toBe(
      "http://localhost:14000/settings"
    );
    expect(new NocoBaseClient("/api").getHeaders()["X-Portal"]).toBe("demo");

    window.NOCOBASE_API_URL = "/api/__app/crm";
    window.NOCOBASE_PORTAL_BASE = "/x/apps/crm/customer/";
    expect(resolveNocoBaseSettingsUrl()).toBe(
      "http://localhost:14000/settings/apps/crm"
    );
    expect(new NocoBaseClient("/api").getHeaders()["X-Portal"]).toBe(
      "customer"
    );
  });

  it("uses the SDK storage convention for main and sub-app sessions", () => {
    const main = new AuthSession({ appName: "main", storage: createStorage() });
    expect(main.getStorageKey("token")).toBe("NOCOBASE_TOKEN");
    expect(main.getStorageKey("auth")).toBe("NOCOBASE_AUTH");
    expect(main.getStorageKey("role")).toBe("NOCOBASE_ROLE");

    const subApp = new AuthSession({
      appName: "crm",
      storage: createStorage(),
    });
    expect(subApp.getStorageKey("token")).toBe("NOCOBASE_CRM_TOKEN");
    expect(subApp.getStorageKey("auth")).toBe("NOCOBASE_CRM_AUTH");
    expect(subApp.getStorageKey("role")).toBe("NOCOBASE_CRM_ROLE");

    const sharedToken = new AuthSession({
      appName: "crm",
      shareToken: true,
      storage: createStorage(),
    });
    expect(sharedToken.getStorageKey("token")).toBe("NOCOBASE_TOKEN");
    expect(sharedToken.getStorageKey("auth")).toBe("NOCOBASE_CRM_AUTH");
  });
});
