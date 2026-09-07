import { Readable } from 'node:stream';

import {
  createAIManager,
  DriveFileStorageFactory,
  type AIManager,
  type FileStorageFactory,
} from '@nocobase/ai-employee';
import {
  createConfigPaths,
  type ConfigPaths,
} from '@nocobase/app-server/config';
import {
  createAuthentication,
  type Auth,
} from '@nocobase/app-plugin-authentication';
import type { Caching } from '@nocobase/caching';
import { createDatabaseManager, type DatabaseManager } from '@nocobase/db';
import { createLogging, type Logging } from '@nocobase/logging';
import {
  SnowflakeIdGenerator,
  type IdGeneratorService,
} from '@nocobase/snowflake';

export interface TestAppDeps {
  readonly ai: AIManager;
  readonly paths: ConfigPaths;
  readonly database: DatabaseManager;
  readonly auth: Auth;
  readonly caching: Caching;
  readonly fileStorageFactory: FileStorageFactory;
  readonly aiStorageDisk: string;
  readonly idGenerator: IdGeneratorService;
  readonly logging: Logging;
}

export function createTestAppDeps(): TestAppDeps {
  const caches = new Map<string, Map<string, unknown>>();
  const objects = new Map<string, Uint8Array>();
  const database = createDatabaseManager({
    default: 'main',
    connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
  });
  return {
    ai: createAIManager(),
    paths: createConfigPaths({ rootDir: process.cwd() }),
    database,
    auth: createAuthentication({
      connection: database.connection(),
      secret: 'ai-employee-test-auth-secret-at-least-32-characters',
    }),
    caching: {
      getCache: ({ namespace }) => {
        const store = caches.get(namespace) ?? new Map<string, unknown>();
        caches.set(namespace, store);
        return {
          get: async <T>(key: string) => store.get(key) as T | undefined,
          set: async <T>(key: string, value: T) => {
            store.set(key, value);
          },
          delete: async (key: string) => store.delete(key),
        };
      },
    },
    fileStorageFactory: new DriveFileStorageFactory({
      use: () => ({
        put: async (key, content) => {
          objects.set(key, content);
        },
        getStream: async (key) => Readable.from(objects.get(key) ?? []),
        getUrl: async (key) => `/storage/${key}`,
      }),
    }),
    aiStorageDisk: 'local',
    idGenerator: new SnowflakeIdGenerator({ workerId: 0 }),
    logging: createLogging({ level: 'silent' }),
  };
}
