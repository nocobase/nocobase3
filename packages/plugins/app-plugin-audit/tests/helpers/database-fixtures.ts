import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createDatabaseManager,
  createMigrator,
  InMemoryCollectionMetadataStore,
  type ConnectionConfig,
  type DatabaseDialect,
  type DatabaseConnection,
  type TransactionHandle,
  transactionAuthority,
} from '@nocobase/db';
import plugin, {
  PortableAuditStore,
  bindAuditRecorder,
} from '@nocobase/app-plugin-audit/server';
import {
  createPluginMigrationSources,
  defineServerPlugins,
  resolveAppServerPlugins,
} from '@nocobase/app-server/plugins';
import { auditRaw, auditRows } from '../../server/database/sql-client.js';
import type { TrustedAuditScope } from '../../server/contracts.js';

export const dialects: DatabaseDialect[] = (
  process.env.AUDIT_TEST_DATABASES ?? 'sqlite'
)
  .split(',')
  .map((dialect) => {
    if (dialect !== 'sqlite' && dialect !== 'postgres' && dialect !== 'mysql')
      throw new Error('Unsupported required audit database.');
    return dialect;
  });
export function handle(connection: DatabaseConnection): TransactionHandle {
  const value = transactionAuthority.current(connection);
  if (!value) throw new Error('Expected active transaction.');
  return value;
}
function localConfig(
  dialect: 'postgres' | 'mysql',
): Exclude<ConnectionConfig, { dialect: 'sqlite' }> {
  const prefix = dialect === 'postgres' ? 'POSTGRES' : 'MYSQL';
  const host = process.env[prefix + '_HOST'];
  if (host !== '127.0.0.1' && host !== 'localhost' && host !== '::1')
    throw new Error(
      'Required audit tests need an explicit local database host.',
    );
  const port = Number(process.env[prefix + '_PORT']);
  if (!Number.isSafeInteger(port) || port <= 0)
    throw new Error('Required audit database port is missing.');
  return {
    dialect,
    host,
    port,
    username: process.env[prefix + '_USER'],
    password: process.env[prefix + '_PASSWORD'],
    database: dialect === 'postgres' ? 'postgres' : 'mysql',
    pool: { min: 0, max: 8 },
  };
}
export async function createPortableFixture(
  dialect: DatabaseDialect,
  migrate: boolean = true,
  name: string = 'main',
): Promise<PortableFixture> {
  const adminConfig = dialect === 'sqlite' ? undefined : localConfig(dialect);
  const directory = await mkdtemp(join(tmpdir(), 'nocobase-audit-test-'));
  const databaseName = 'audit_test_' + randomUUID().replaceAll('-', '');
  const admin = adminConfig
    ? createDatabaseManager({ connections: { main: adminConfig } })
    : undefined;
  let created = false;
  const metadata = new InMemoryCollectionMetadataStore();
  const config: ConnectionConfig = adminConfig
    ? { ...adminConfig, database: databaseName }
    : { dialect: 'sqlite', filename: join(directory, 'audit.sqlite') };
  const manager = createDatabaseManager({
    default: name,
    metadataStore: metadata,
    connections: { [name]: config },
  });
  const connection = manager.connection();
  let cleaned = false;
  const cleanup = async (): Promise<void> => {
    if (cleaned) return;
    cleaned = true;
    try {
      await manager.destroy();
    } finally {
      try {
        if (admin && created)
          await auditRaw(
            admin.connection(),
            'DROP DATABASE "' + databaseName + '"',
          );
      } finally {
        await admin?.destroy();
        await rm(directory, { recursive: true, force: true });
      }
    }
  };
  try {
    if (admin) {
      await auditRaw(
        admin.connection(),
        'CREATE DATABASE "' +
          databaseName +
          '"' +
          (dialect === 'mysql'
            ? ' CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci'
            : ''),
      );
      created = true;
    }
    await auditRows(connection, 'SELECT 1');
    const migrator = createMigrator({
      database: manager,
      connection: name,
      sources: createPluginMigrationSources(
        resolveAppServerPlugins(
          new URL('../../', import.meta.url).pathname,
          defineServerPlugins([plugin]),
        ).plugins.map((entry) => entry.metadata),
      ),
    });
    if (migrate) await migrator.latest();
    const scope: TrustedAuditScope = {
      appId: 'synthetic-app',
      actor: { type: 'user', id: 'synthetic-user' },
    };
    const store = new PortableAuditStore(connection, {
      appId: scope.appId,
      store: name,
    });
    if (migrate) await store.prepare();
    const recorder = bindAuditRecorder(scope, {
      store,
      producer: 'synthetic-runtime',
      policy: () =>
        Promise.resolve({
          enabled: true,
          revision: 7,
          maxDetailsBytes: 262144,
        }),
    });
    return {
      dialect,
      config,
      directory,
      databaseName,
      manager,
      connection,
      metadata,
      migrator,
      scope,
      store,
      recorder,
      cleanup,
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
export interface PortableFixture {
  dialect: DatabaseDialect;
  config: ConnectionConfig;
  directory: string;
  databaseName: string;
  manager: ReturnType<typeof createDatabaseManager>;
  connection: DatabaseConnection;
  metadata: InMemoryCollectionMetadataStore;
  migrator: ReturnType<typeof createMigrator>;
  scope: TrustedAuditScope;
  store: PortableAuditStore;
  recorder: ReturnType<typeof bindAuditRecorder>;
  cleanup(): Promise<void>;
}
export { auditRaw, auditRows };
