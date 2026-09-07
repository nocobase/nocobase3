import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { Knex } from 'knex';
import {
  createDatabaseManager,
  InMemoryCollectionMetadataStore,
  createMigrator,
  type ConnectionConfig,
  type DatabaseDialect,
} from '@nocobase/db';
import {
  createPluginMigrationSources,
  defineServerPlugins,
  resolveAppServerPlugins,
} from '@nocobase/app-server/plugins';
import auditPlugin, {
  PortableAuditStore,
  bindAuditRecorder,
  NodeAuditScopeCarrier,
  TrustedAuditRuntime,
} from '@nocobase/app-plugin-audit/server';
import type { WorkflowAuditBridge } from '../server/audit.js';
import { attachWorkflowAudit } from '../server/audit-internal.js';
import originalMigration from '../database/migrations/202608200001_create_workflow_collections.js';
import contextMigration from '../database/migrations/202609060001_workflow_audit_context.js';

export const auditDialects: DatabaseDialect[] = (
  process.env.AUDIT_TEST_DATABASES ?? 'sqlite'
)
  .split(',')
  .map((value) => {
    if (value !== 'sqlite' && value !== 'postgres' && value !== 'mysql')
      throw new Error('Invalid audit test dialect');
    return value;
  });

export async function auditFixture(
  dialect: DatabaseDialect,
  timezone?: string,
) {
  const name = `audit_g17_${randomUUID().replaceAll('-', '')}`;
  const prefix = dialect === 'postgres' ? 'POSTGRES' : 'MYSQL';
  const host = process.env[`${prefix}_HOST`];
  const port = Number(process.env[`${prefix}_PORT`]);
  if (
    dialect !== 'sqlite' &&
    (host !== '127.0.0.1' || !Number.isInteger(port) || port <= 0)
  )
    throw new Error('Explicit local audit database required');
  const config: ConnectionConfig =
    dialect === 'sqlite'
      ? { dialect, filename: ':memory:' }
      : {
          dialect,
          ...(dialect === 'mysql' && timezone ? { timezone } : {}),
          host,
          port,
          username: process.env[`${prefix}_USER`],
          password: process.env[`${prefix}_PASSWORD`],
          database: dialect === 'postgres' ? 'postgres' : 'mysql',
        };
  const admin =
    dialect === 'sqlite'
      ? undefined
      : createDatabaseManager({ connections: { main: config } });
  if (admin) {
    const client = await admin.connection().client<Knex>();
    await client.raw('CREATE DATABASE ??', [name]);
  }
  const metadata = new InMemoryCollectionMetadataStore();
  const database = createDatabaseManager({
    metadataStore: metadata,
    connections: {
      main: dialect === 'sqlite' ? config : { ...config, database: name },
    },
  });
  const connection = database.connection();
  const context = {
    connection,
    builder: connection.builder,
    query: connection.query,
  };
  let bridge: WorkflowAuditBridge | undefined;
  const carrier = new NodeAuditScopeCarrier('g17-app');
  const store = new PortableAuditStore(connection, {
    appId: 'g17-app',
    store: 'main',
  });
  const bind = (
    scope: Parameters<typeof bindAuditRecorder>[0],
    options: { producer: string },
  ) =>
    bindAuditRecorder(scope, {
      store,
      producer: options.producer,
      policy: async () => ({
        enabled: true,
        revision: 1,
        maxDetailsBytes: 16384,
      }),
    });
  const runtime = new TrustedAuditRuntime({
    appId: 'g17-app',
    carrier,
    bind: (scope) => bind(scope, { producer: 'workflow' }),
    diagnostic: () => undefined,
  });
  const dispose = async () => {
    runtime.dispose();
    await database.destroy();
    if (admin) {
      try {
        const client = await admin.connection().client<Knex>();
        await client.raw('DROP DATABASE ??', [name]);
      } finally {
        await admin.destroy();
      }
    }
  };
  try {
    await originalMigration.up(context);
    await contextMigration.up(context);
    await createMigrator({
      database,
      sources: createPluginMigrationSources(
        resolveAppServerPlugins(
          fileURLToPath(new URL('../', import.meta.url)),
          defineServerPlugins([auditPlugin]),
        ).plugins.map((entry) => entry.metadata),
      ),
    }).latest();
    await store.prepare();
    bridge = {
      runtime,
      collector: { captureScope: () => undefined },
      service: { bind, http: () => async (_context, next) => next() },
    };
    attachWorkflowAudit(database, () => bridge);
    process.stdout.write(
      JSON.stringify({ dialect, database: name }) + String.fromCharCode(10),
    );
    return {
      database,
      metadata,
      connection,
      context,
      runtime,
      store,
      bind,
      dispose,
      disable: () => {
        bridge = undefined;
      },
      events: async () => {
        const client = await connection.client<Knex>();
        const rows = await client<{ payload: string }>('auditEvents').select(
          'payload',
        );
        return rows.map(
          (row) =>
            JSON.parse(
              row.payload,
            ) as import('@nocobase/app-plugin-audit/server/contracts').AuditEventDto,
        );
      },
    };
  } catch (error) {
    await dispose();
    throw error;
  }
}
