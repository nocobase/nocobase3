import { describe, expect, it } from "vitest";

import {
  getPortalStorageKey,
  loadPortalE2EEnvironment,
  requirePortalE2ECredentials,
  resolvePortalApiActionURL,
  resolvePortalTestURL,
} from "../../e2e/support";

describe("Portal E2E environment", () => {
  it("resolves a locally hosted sub-application Portal and its API metadata", () => {
    const environment = loadPortalE2EEnvironment({
      NOCOBASE_E2E_PORT: "4180",
      NOCOBASE_PORTAL_BASE: "/x/apps/sales/crm",
      NOCOBASE_E2E_API_URL:
        "https://api.example.test/api/__app/sales",
      NOCOBASE_E2E_AUTHENTICATOR: "password",
      NOCOBASE_E2E_ROLE: "sales-manager",
    });

    expect(environment).toMatchObject({
      origin: "http://127.0.0.1:4180",
      port: 4180,
      baseURL: "http://127.0.0.1:4180/x/apps/sales/crm/",
      apiURL: "https://api.example.test/api/__app/sales",
      portalBase: "/x/apps/sales/crm/",
      portalName: "crm",
      appName: "sales",
      authenticator: "password",
      role: "sales-manager",
    });
    expect(resolvePortalTestURL(environment, "/login")).toBe(
      "http://127.0.0.1:4180/x/apps/sales/crm/login"
    );
    expect(resolvePortalApiActionURL(environment, "auth", "signIn")).toBe(
      "https://api.example.test/api/__app/sales/auth:signIn"
    );
  });

  it("uses app-scoped session keys unless the sub-app token is shared", () => {
    const environment = loadPortalE2EEnvironment({
      NOCOBASE_PORTAL_BASE: "/x/apps/sales/crm/",
      NOCOBASE_API_URL: "/api/__app/sales",
    });

    expect(getPortalStorageKey(environment, "token")).toBe(
      "NOCOBASE_SALES_TOKEN"
    );
    expect(getPortalStorageKey(environment, "role")).toBe(
      "NOCOBASE_SALES_ROLE"
    );
    expect(
      getPortalStorageKey({ ...environment, shareToken: true }, "token")
    ).toBe("NOCOBASE_TOKEN");
  });

  it("requires non-empty credentials for login tests", () => {
    const environment = loadPortalE2EEnvironment({});

    expect(() =>
      requirePortalE2ECredentials(environment, {
        NOCOBASE_E2E_ACCOUNT: "nocobase",
        NOCOBASE_E2E_PASSWORD: "",
      })
    ).toThrow(/NOCOBASE_E2E_ACCOUNT and NOCOBASE_E2E_PASSWORD are required/);
  });
});
