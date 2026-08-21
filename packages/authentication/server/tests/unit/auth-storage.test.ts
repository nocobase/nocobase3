import { createCaching, type Caching } from "@nocobase/caching";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAuthStorage } from "../../auth-storage.js";

describe("createAuthStorage", () => {
  const instances: Caching[] = [];

  afterEach(async () => {
    vi.useRealTimers();
    await Promise.all(instances.splice(0).map((caching) => caching.dispose()));
  });

  function createStorage(namespace?: string) {
    const caching = createCaching();
    instances.push(caching);
    return {
      caching,
      storage: createAuthStorage(
        caching,
        namespace ? { namespace } : undefined,
      ),
    };
  }

  it("uses the nocobase-auth namespace by default and converts TTL seconds", async () => {
    vi.useFakeTimers();
    const { caching, storage } = createStorage();

    await storage.set("session", "value", 1);
    await expect(storage.get("session")).resolves.toBe("value");
    await expect(
      caching.getCache({ namespace: "nocobase-auth" }).get("session"),
    ).resolves.toBe("value");

    await vi.advanceTimersByTimeAsync(1_001);
    await expect(storage.get("session")).resolves.toBeNull();
  });

  it("atomically consumes one-time values", async () => {
    const { storage } = createStorage();
    await storage.set("verification", "value", 60);

    const values = await Promise.all([
      storage.getAndDelete!("verification"),
      storage.getAndDelete!("verification"),
    ]);
    expect(values.filter((value) => value === "value")).toHaveLength(1);
  });

  it("uses an atomic fixed-window counter for rate limiting", async () => {
    const { storage } = createStorage("custom-auth");

    await expect(
      Promise.all([
        storage.increment!("sign-in", 10),
        storage.increment!("sign-in", 10),
        storage.increment!("sign-in", 10),
      ]),
    ).resolves.toEqual([1, 2, 3]);
  });
});
