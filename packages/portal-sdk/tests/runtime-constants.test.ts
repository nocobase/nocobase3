import { afterEach, describe, expect, it, vi } from "vitest";

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

describe("runtime constants", () => {
  it("preserves absolute NOCOBASE_API_URL values", async () => {
    vi.resetModules();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        NOCOBASE_API_URL: "https://example.com/nocobase/api/",
      },
    });

    const constants = await import("../src/runtime/constants.ts");

    expect(constants.API_URL).toBe("https://example.com/nocobase/api/");
    expect(constants.API_ORIGIN).toBe("https://example.com");
  });

  it("preserves relative NOCOBASE_API_URL values", async () => {
    vi.resetModules();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        NOCOBASE_API_URL: "/api",
      },
    });

    const constants = await import("../src/runtime/constants.ts");

    expect(constants.API_URL).toBe("/api");
    expect(constants.API_ORIGIN).toBeUndefined();
  });
});
