import { mkdtemp, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LocalStorageDriver } from "../../src/storage/local/local-storage-driver.ts";
import { runStorageDriverContract } from "./storage-driver-contract.ts";
const stream = (value: string) => new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new TextEncoder().encode(value)); c.close(); } });
describe("local storage", () => {
  it("satisfies the driver contract", async () => { await runStorageDriverContract(async () => new LocalStorageDriver({ root: await mkdtemp(path.join(tmpdir(), "files-")) })); });
  it("rejects mismatch and symlink escape", async () => { const root = await mkdtemp(path.join(tmpdir(), "files-")); const driver = new LocalStorageDriver({ root }); await expect(driver.putObject({ key: "x", body: stream("abc"), contentType: "text/plain", expectedSize: 2 })).rejects.toThrow(); expect(await driver.statObject({ key: "x" })).toBeNull(); const outside = await mkdtemp(path.join(tmpdir(), "outside-")); await symlink(outside, path.join(root, "link")); await expect(driver.statObject({ key: "link/file" })).rejects.toThrow(); });
  it("cleans up on abort and checksum mismatch", async () => { const root = await mkdtemp(path.join(tmpdir(), "files-")); const driver = new LocalStorageDriver({ root }); const controller = new AbortController(); controller.abort(); await expect(driver.putObject({ key: "abort", body: stream("abc"), contentType: "text/plain", expectedSize: 3, signal: controller.signal })).rejects.toThrow(); await expect(driver.putObject({ key: "checksum", body: stream("abc"), contentType: "text/plain", expectedSize: 3, checksumSha256: "bad" })).rejects.toThrow(); expect(await driver.statObject({ key: "abort" })).toBeNull(); expect(await driver.statObject({ key: "checksum" })).toBeNull(); });
  it("publishes one immutable object under concurrent writes", async () => { const root = await mkdtemp(path.join(tmpdir(), "files-")); const driver = new LocalStorageDriver({ root }); const writes = await Promise.allSettled([driver.putObject({ key: "same", body: stream("one"), contentType: "text/plain", expectedSize: 3 }), driver.putObject({ key: "same", body: stream("two"), contentType: "text/plain", expectedSize: 3 })]); expect(writes.filter(result => result.status === "fulfilled")).toHaveLength(1); expect((await driver.statObject({ key: "same" }))?.size).toBe(3); });
});
