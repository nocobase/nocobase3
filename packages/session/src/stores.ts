import { createStorage, type Storage } from 'unstorage';
import fsDriver from 'unstorage/drivers/fs';
import memoryDriver from 'unstorage/drivers/memory';
import nullDriver from 'unstorage/drivers/null';
import redisDriver from 'unstorage/drivers/redis';
import type { RedisOptions } from 'unstorage/drivers/redis';

import type {
  AppSessionStoreConfig,
  NocoBaseSessionStore,
  RedisSessionStoreConfig,
  SessionData,
  SessionStoreSetOptions,
  StoredSession,
} from './types.js';

type SessionStorageValue<Data extends SessionData> = StoredSession<Data>;

export function createSessionStore<Data extends SessionData = SessionData>(
  config: AppSessionStoreConfig,
): NocoBaseSessionStore<Data> {
  if (config.driver === 'memory') {
    return createUnstorageSessionStore(
      createStorage<SessionStorageValue<Data>>({
        driver: memoryDriver(),
      }),
      config.base,
    );
  }

  if (config.driver === 'fs') {
    return createUnstorageSessionStore(
      createStorage<SessionStorageValue<Data>>({
        driver: fsDriver({
          base: config.base,
        }),
      }),
    );
  }

  if (config.driver === 'redis') {
    return createUnstorageSessionStore(
      createStorage<SessionStorageValue<Data>>({
        driver: redisDriver(createRedisOptions(config)),
      }),
      config.base,
    );
  }

  return createUnstorageSessionStore(
    createStorage<SessionStorageValue<Data>>({
      driver: nullDriver(),
    }),
  );
}

export function createUnstorageSessionStore<
  Data extends SessionData = SessionData,
>(
  storage: Storage<SessionStorageValue<Data>>,
  base = '',
): NocoBaseSessionStore<Data> {
  const prefix = normalizeBase(base);

  return {
    async get(id: string): Promise<StoredSession<Data> | null> {
      return storage.getItem(toStorageKey(prefix, id));
    },

    async set(
      id: string,
      value: StoredSession<Data>,
      options: SessionStoreSetOptions = {},
    ): Promise<void> {
      await storage.setItem(
        toStorageKey(prefix, id),
        value,
        options.ttl ? { ttl: options.ttl } : undefined,
      );
    },

    async delete(id: string): Promise<void> {
      await storage.removeItem(toStorageKey(prefix, id));
    },

    async keys(): Promise<string[]> {
      const keys = await storage.getKeys(prefix);
      return keys.map((key) => key.slice(prefix.length));
    },

    async dispose(): Promise<void> {
      await storage.dispose();
    },
  };
}

function createRedisOptions(config: RedisSessionStoreConfig): RedisOptions {
  return {
    db: config.db,
    host: config.host,
    keyPrefix: config.keyPrefix,
    password: config.password,
    port: config.port,
    ttl: config.ttl,
    username: config.username,
    url: config.url,
    tls: config.tls ? {} : undefined,
  };
}

function normalizeBase(base: string | undefined): string {
  const value = base?.trim();
  if (!value) {
    return '';
  }

  return value.endsWith(':') || value.endsWith('/') ? value : `${value}:`;
}

function toStorageKey(prefix: string, id: string): string {
  return `${prefix}${id}`;
}
