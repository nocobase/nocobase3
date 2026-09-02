import { createConfigPaths } from '@nocobase/app-server/config';
import { createAuthentication } from '@nocobase/app-plugin-authentication';
import { SnowflakeIdGenerator } from '@nocobase/snowflake';
import { createLogging } from '@nocobase/logging';
import { createDatabaseManager } from '@nocobase/db';
import {
  createAIManager,
  DriveFileStorageFactory,
} from '@nocobase/ai-employee';
import { Readable } from 'node:stream';
import type { AppDeps } from '../../server/runtime.js';

export function createTestAppDeps(): AppDeps {
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
