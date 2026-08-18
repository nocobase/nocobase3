export * from "./contracts/index.ts";
export * from "./module-types.ts";
export * from "./config/index.ts";
export * from "./authorization/index.ts";
export * from "./errors/index.ts";
export * from "./http/index.ts";
export * from "./openapi/index.ts";
export * from "./application/presenter.ts";
export * from "./application/upload-service.ts";
export * from "./persistence/index.ts";
export * from "./storage/index.ts";
import { randomUUID } from "node:crypto";
import { createFilesOpenAPIApp } from "./http/index.ts";
import { parseFilesConfig } from "./config/index.ts";
import { KyselyFilesStore } from "./persistence/kysely-files-store.ts";
import { InMemoryStorageDriverRegistry } from "./storage/driver-registry.ts";
import { UploadService } from "./application/upload-service.ts";
export function createFilesModule(options: import("./module-types.ts").FilesModuleOptions): import("./module-types.ts").FilesModule {
  const config = parseFilesConfig(options.config);
  const store = new KyselyFilesStore(options.db, options.now);
  const registry = new InMemoryStorageDriverRegistry(options.drivers);
  for (const [key, backend] of Object.entries(config.backends)) if (!registry.has(key) || registry.get(key).type !== backend.driver) throw new Error(`Invalid storage driver: ${key}`);
  const uploads = new UploadService({ config, store, registry, requestContext: options.requestContext, authorizer: options.authorizer, now: options.now ?? (() => new Date()), generateId: options.generateId ?? randomUUID });
  const router = createFilesOpenAPIApp({ config, requestContext: options.requestContext, getDriverCapabilities: () => registry.listCapabilities(), uploads, logger: options.logger });
  return { router, store };
}
