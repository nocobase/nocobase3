import { afterEach, describe, expect, it } from "vitest";

import { assetUrl } from "../../client/lib/utils";

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

describe("assetUrl", () => {
  it("resolves public asset names under the current app assets path", () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        NOCOBASE_PORTAL_BASE: "/app-template-default/",
      },
    });

    expect(assetUrl("logo.png")).toBe("/app-template-default/assets/logo.png");
    expect(assetUrl("/logo.png")).toBe("/app-template-default/assets/logo.png");
    expect(assetUrl("assets/logo.png")).toBe("/app-template-default/assets/logo.png");
    expect(assetUrl("/assets/logo.png")).toBe("/app-template-default/assets/logo.png");
    expect(assetUrl("/app-template-default/assets/logo.png")).toBe("/app-template-default/assets/logo.png");
  });

  it("keeps external URLs unchanged", () => {
    expect(assetUrl("https://cdn.example.com/logo.png")).toBe(
      "https://cdn.example.com/logo.png",
    );
    expect(assetUrl("//cdn.example.com/logo.png")).toBe(
      "//cdn.example.com/logo.png",
    );
    expect(assetUrl("#logo")).toBe("#logo");
  });
});
