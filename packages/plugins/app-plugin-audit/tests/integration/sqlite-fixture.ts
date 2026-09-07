import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import plugin from '@nocobase/app-plugin-audit/server';
import {
  resolveAppServerPlugins,
  defineServerPlugins,
  createPluginMigrationSources,
} from '@nocobase/app-server/plugins';
import {
  createDatabaseManager,
  createMigrator,
  InMemoryCollectionMetadataStore,
  type DatabaseConnection,
  type DatabaseManager,
} from '@nocobase/db';
import {
  SqliteAuditStore,
  bindAuditRecorder,
} from '@nocobase/app-plugin-audit/server';
import type {
  TrustedAuditScope,
  AuditRecorder,
} from '../../server/contracts.js';
import type { AuditRecorderPolicy } from '../../server/service.js';

export interface RawClient {
  raw(sql: string, bindings?: readonly unknown[]): Promise<unknown>;
}
export interface Fixture {
  directory: string;
  manager: DatabaseManager;
  connection: DatabaseConnection;
  metadata: InMemoryCollectionMetadataStore;
  store: SqliteAuditStore;
  scope: TrustedAuditScope;
  recorder: AuditRecorder;
  policy: AuditRecorderPolicy;
  cleanup(): Promise<void>;
}
export async function createFixture(migrate: boolean = true): Promise<Fixture> {
  const directory = await mkdtemp(join(tmpdir(), 'nocobase-audit-g05-'));
  const metadata = new InMemoryCollectionMetadataStore();
  const manager = createDatabaseManager({
    connections: {
      main: {
        dialect: 'sqlite',
        filename: join(directory, 'audit.sqlite'),
        metadataStore: metadata,
      },
    },
  });
  const connection = manager.connection();
  try {
    const client = await connection.client<RawClient>();
    await client.raw('SELECT 1 AS ok');
    if (migrate) {
      const migrator = createMigrator({
        database: manager,
        sources: createPluginMigrationSources(
          resolveAppServerPlugins(
            new URL('../../', import.meta.url).pathname,
            defineServerPlugins([plugin]),
          ).plugins.map((entry) => entry.metadata),
        ),
      });
      await migrator.latest();
    }
    const scope: TrustedAuditScope = {
      appId: 'synthetic-app',
      actor: { type: 'user', id: 'synthetic-user' },
    };
    const store = new SqliteAuditStore(connection, {
      appId: scope.appId,
      store: 'main',
    });
    if (migrate) await store.prepare();
    const fixture: Fixture = {
      directory,
      manager,
      connection,
      metadata,
      store,
      scope,
      policy: { revision: 7, enabled: true, maxDetailsBytes: 65536 },
      recorder: bindAuditRecorder(scope, {
        producer: 'synthetic-runtime',
        store,
        policy: () => Promise.resolve(fixture.policy),
      }),
      async cleanup(): Promise<void> {
        await manager.destroy();
        await rm(directory, { recursive: true, force: true });
      },
    };
    return fixture;
  } catch (error) {
    await manager.destroy();
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
