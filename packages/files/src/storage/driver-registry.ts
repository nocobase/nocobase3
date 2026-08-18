import { StorageDriverError } from "./storage-errors.ts";
import type { StorageDriver } from "./storage-driver.ts";
export interface StorageDriverRegistry { get(backendKey: string): StorageDriver; has(backendKey: string): boolean; listCapabilities(): Array<{ backendKey: string; type: string; uploadModes: Array<"proxy" | "presigned-put">; externalReadTarget: boolean }> }
export class InMemoryStorageDriverRegistry implements StorageDriverRegistry {
  private readonly drivers: ReadonlyMap<string, StorageDriver>;
  constructor(entries: Record<string, StorageDriver> | Iterable<readonly [string, StorageDriver]>) {
    const map = new Map<string, StorageDriver>();
    for (const [key, driver] of Symbol.iterator in Object(entries) ? entries as Iterable<readonly [string, StorageDriver]> : Object.entries(entries)) {
      if (map.has(key)) throw new StorageDriverError("invalid-object", "duplicate storage backend");
      map.set(key, driver);
    }
    this.drivers = map;
  }
  get(key: string): StorageDriver { const driver = this.drivers.get(key); if (!driver) throw new StorageDriverError("invalid-object", "unknown storage backend"); return driver; }
  has(key: string): boolean { return this.drivers.has(key); }
  listCapabilities() { return [...this.drivers].map(([backendKey, driver]) => ({ backendKey, type: driver.type, ...driver.capabilities() })); }
}
