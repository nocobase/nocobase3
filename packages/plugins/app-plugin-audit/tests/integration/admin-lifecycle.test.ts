import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { AppConfig } from '@nocobase/app-server/config';
import {
  DatabaseProvider,
  databaseConfig,
  databaseLifecycleObserverToken,
  runAppMigrations,
} from '@nocobase/app-server/database';
import { createAdminAuditApp } from '../helpers/admin-fixture.js';
import { dialects, auditRows } from '../helpers/database-fixtures.js';
import { AuditReadiness } from '../../server/providers/readiness.js';

async function setup(
  dialect: (typeof dialects)[number],
  fail: boolean = false,
) {
  const app = await createAdminAuditApp(dialect);
  const directory = join(app.fixture.directory, 'migrations');
  const seeds = join(app.fixture.directory, 'seeds');
  await mkdir(directory);
  await mkdir(seeds);
  const migrationDefine = new URL(
    '../../../../libs/db/src/migration/define.ts',
    import.meta.url,
  ).href;
  const seedDefine = new URL(
    '../../../../libs/db/src/seed/define.ts',
    import.meta.url,
  ).href;
  await writeFile(
    join(directory, '202609060001_g19_table.mjs'),
    "import { defineMigration } from '" +
      migrationDefine +
      "'; export default defineMigration({ name: '202609060001_g19_table', async up({builder}) { await builder.createCollection('g19Ddl', t => { t.string('id').primary(); }); " +
      (fail ? "throw new Error('G19_DATABASE_PASSWORD_SENTINEL');" : '') +
      " }, async down({builder}) { await builder.dropCollection('g19Ddl'); } });",
  );
  await writeFile(
    join(seeds, '202609060001_g19_seed.mjs'),
    "import { defineSeed } from '" +
      seedDefine +
      "'; export default defineSeed({ name: '202609060001_g19_seed', async run({query}) { await query.insertInto('g19Ddl').values({id:'seeded'}).execute(); } });",
  );
  const config = new AppConfig([
    {
      ...databaseConfig,
      defaults: {
        default: 'main',
        connections: {
          main: Object.fromEntries(
            Object.entries(app.fixture.config).filter(
              ([, value]) => value !== undefined,
            ),
          ),
        },
        migrations: { directory, autoRun: true, extensions: ['.mjs'] },
        seeds: { directory: seeds, autoRun: true, extensions: ['.mjs'] },
      },
    },
  ]);
  await config.loadAll();
  const provider = new DatabaseProvider({
    config,
    paths: app.app.paths,
    container: app.app.container,
  });
  return { app, provider, config };
}

describe.each(dialects)('administrative database lifecycle %s', (dialect) => {
  it('allows explicitly unobserved bootstrap without recreating audit storage and refuses required missing collectors', async () => {
    const { app, provider } = await setup(dialect);
    try {
      const settings = await app.settings.get(app.fixture.scope);
      const required = new AuditReadiness({
        stores: [
          { connection: app.fixture.connection, store: app.fixture.store },
        ],
        catalog: app.catalog,
        health: app.health,
        requirements: {
          auditRequired: true,
          mandatorySources: ['request'],
          requiredDataSources: [],
        },
      });
      await expect(required.start(settings)).rejects.toMatchObject({
        code: 'AUDIT_NOT_READY',
      });
      await app.fixture.connection.builder.dropCollection('auditEvents');
      await provider.boot();
      expect(
        await app.fixture.connection.query
          .selectFrom('g19Ddl')
          .selectAll()
          .execute(),
      ).toEqual([{ id: 'seeded' }]);
      await expect(app.fixture.store.prepare()).rejects.toMatchObject({
        code: 'AUDIT_NOT_READY',
      });
    } finally {
      await app.close();
    }
  });

  it('records real provider migration/seed phases separately and preserves successful DDL after observer failure', async () => {
    const { app, provider } = await setup(dialect);
    const diagnostic = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    app.app.container.instance(databaseLifecycleObserverToken, {
      before: async (phase) => {
        await app.runtime.recorder.record({
          action: 'database.' + phase + '.attempted',
          outcome: 'accepted',
        });
      },
      after: async (result) => {
        await app.runtime.recorder.record({
          action: 'database.' + result.phase + '.completed',
          outcome: result.outcome,
          details: { code: result.code },
        });
        if (result.phase === 'migrations')
          throw new Error('G19_OBSERVER_SECRET');
      },
    });
    try {
      await app.start();
      await app.runtime.runRequest(() => provider.boot());
      expect(
        await app.fixture.connection.query
          .selectFrom('g19Ddl')
          .selectAll()
          .execute(),
      ).toEqual([{ id: 'seeded' }]);
      const events = await app.events();
      expect(events).toHaveLength(4);
      expect(new Set(events.map((event) => event.operationId)).size).toBe(1);
      expect(
        events.filter((event) => event.outcome === 'success'),
      ).toHaveLength(2);
      expect(diagnostic).toHaveBeenCalledWith(
        'Database lifecycle observation failed.',
        { code: 'DATABASE_LIFECYCLE_OBSERVATION_FAILED', phase: 'migrations' },
      );
      expect(JSON.stringify(diagnostic.mock.calls)).not.toContain(
        'G19_OBSERVER_SECRET',
      );
    } finally {
      diagnostic.mockRestore();
      await app.close();
    }
  });

  it('records the real failure without replacing its error or asserting cross-dialect DDL rollback', async () => {
    const { app, provider } = await setup(dialect, true);
    const diagnostic = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    app.app.container.instance(databaseLifecycleObserverToken, {
      before: async (phase) => {
        await app.runtime.recorder.record({
          action: 'database.' + phase + '.attempted',
          outcome: 'accepted',
        });
      },
      after: async (result) => {
        await app.runtime.recorder.record({
          action: 'database.' + result.phase + '.failed',
          outcome: result.outcome,
          details: { code: result.code },
        });
        throw new Error('G19_OBSERVER_SECRET');
      },
    });
    try {
      await app.start();
      await expect(
        app.runtime.runRequest(() => provider.boot()),
      ).rejects.toThrow('G19_DATABASE_PASSWORD_SENTINEL');
      const events = await app.events();
      expect(events).toHaveLength(2);
      expect(
        events.some((event) => event.action === 'database.seeds.attempted'),
      ).toBe(false);
      expect(events.some((event) => event.outcome === 'failed')).toBe(true);
      expect(JSON.stringify(events)).not.toContain(
        'G19_DATABASE_PASSWORD_SENTINEL',
      );
      expect(JSON.stringify(diagnostic.mock.calls)).not.toContain(
        'G19_OBSERVER_SECRET',
      );
    } finally {
      diagnostic.mockRestore();
      await app.close();
    }
  });

  it('blocks required admission before DDL when disabled or missing storage and does not emit a false executed failure', async () => {
    const { app, provider } = await setup(dialect);
    const after = vi.fn();
    const required = new AuditReadiness({
      stores: [
        { connection: app.fixture.connection, store: app.fixture.store },
      ],
      catalog: app.catalog,
      health: app.health,
      requirements: {
        auditRequired: true,
        mandatorySources: ['request'],
        requiredDataSources: [],
      },
    });
    let disabled = true;
    app.app.container.instance(databaseLifecycleObserverToken, {
      before: async () => {
        const settings = await app.settings.get(app.fixture.scope);
        await required.start({ ...settings, enabled: !disabled });
      },
      after,
    });
    try {
      await app.start();
      await expect(provider.boot()).rejects.toMatchObject({
        code: 'AUDIT_POLICY_CONFLICT',
      });
      expect(after).not.toHaveBeenCalled();
      expect(await app.events()).toHaveLength(0);
      disabled = false;
      await app.fixture.connection.builder.dropCollection('auditEvents');
      await expect(provider.boot()).rejects.toMatchObject({
        code: 'AUDIT_NOT_READY',
      });
      expect(after).not.toHaveBeenCalled();
      const tables = await auditRows(
        app.fixture.connection,
        dialect === 'sqlite'
          ? "SELECT name FROM sqlite_master WHERE name = 'g19_ddl'"
          : "SELECT table_name FROM information_schema.tables WHERE table_name = 'g19_ddl' AND table_schema = " +
              (dialect === 'mysql' ? 'DATABASE()' : 'current_schema()'),
      );
      expect(tables).toHaveLength(0);
    } finally {
      await app.close();
    }
  });

  it('reports missing task directories as unknown and standalone migration remains outside App capture', async () => {
    const { app, config } = await setup(dialect);
    const input = config.get(databaseConfig);
    const missing = {
      ...input,
      migrations: {
        ...input.migrations,
        directory: join(app.fixture.directory, 'missing'),
      },
      seeds: { ...input.seeds!, autoRun: false },
    };
    const local = new AppConfig([{ ...databaseConfig, defaults: missing }]);
    await local.loadAll();
    app.app.container.instance(databaseLifecycleObserverToken, {
      before: async () => undefined,
      after: async (result) => {
        await app.runtime.recorder.record({
          action: 'database.' + result.phase + '.result',
          outcome: result.outcome,
          details: { code: result.code },
        });
      },
    });
    try {
      await app.start();
      await app.runtime.runRequest(() =>
        new DatabaseProvider({
          config: local,
          paths: app.app.paths,
          container: app.app.container,
        }).boot(),
      );
      expect((await app.events())[0]).toMatchObject({
        outcome: 'unknown',
        details: { code: 'DATABASE_TASK_SKIPPED' },
      });
      const count = (await app.events()).length;
      const result = await runAppMigrations(input, app.app.paths);
      expect(result?.status).toBe('completed');
      expect((await app.events()).length).toBe(count);
    } finally {
      await app.close();
    }
  });
});
