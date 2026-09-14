import { expect, it } from 'vitest';
import type {
  DatabaseIntegrationAdapter,
  DatabaseIntegrationContext,
} from './index.js';
import { defineDatabaseIntegrationSuite } from './index.js';

export function definePortableIntegrationContracts(
  adapter: DatabaseIntegrationAdapter,
): void {
  defineDatabaseIntegrationSuite(
    adapter,
    (context) => {
      it('creates a collection with portable naming', async () => {
        await context.builder.createCollection('orderItems', (collection) => {
          collection.increments('id');
          collection.string('orderNo');
          collection.datetime('createdAt');
        });

        await expect(
          context.db.schema.hasTable(context.table('orderItems')),
        ).resolves.toBe(true);
        await expect(
          context.db.schema.hasColumn(context.table('orderItems'), 'order_no'),
        ).resolves.toBe(true);
        await expect(
          context.db.schema.hasColumn(
            context.table('orderItems'),
            'created_at',
          ),
        ).resolves.toBe(true);
      });

      it('previews DDL during dryRun without executing it', async () => {
        const result = await context.builder.createCollection(
          'dryRunItems',
          {
            fields: [
              {
                name: 'id',
                type: 'increments',
                primaryKey: true,
              },
            ],
          },
          { dryRun: true, previewSql: true },
        );

        await expect(
          context.db.schema.hasTable(context.table('dryRunItems')),
        ).resolves.toBe(false);
        expect(result.sql?.join('\n').toLowerCase()).toContain('create table');
        expect(result.sql?.join('\n')).toContain(context.table('dryRunItems'));
      });

      it('creates and reads a view through the portable builder API', async () => {
        await context.builder.createCollection('viewSource', (collection) => {
          collection.increments('id');
          collection.string('label');
        });
        await context.db(context.table('viewSource')).insert({ label: 'Ada' });

        await context.builder.createViewCollection('viewRows', (view) => {
          view.string('label');
          view.as((query) =>
            query.from('viewSource').select('label').where('label', '=', 'Ada'),
          );
        });

        await expect(
          context.db(context.table('viewRows')).select('*'),
        ).resolves.toEqual([{ label: 'Ada' }]);
      });

      it('compiles portable query operations with connection naming', () => {
        const compiled = context.database
          .query()
          .selectFrom('queryOrders')
          .select(['orderNo', 'createdAt'])
          .where('status', '=', 'paid')
          .compile();

        expect(compiled.sql).toContain(context.table('queryOrders'));
        expect(compiled.sql).toContain('order_no');
        expect(compiled.sql).toContain('created_at');
        expect(compiled.parameters).toContain('paid');
      });

      it('keeps identity validation independent from the dialect', async () => {
        await context.builder.createCollection('keyless', (collection) => {
          collection.string('id');
          collection.string('message');
        });
        const repository = context.database.repository('keyless');

        await expect(
          repository.createOne({ values: { id: 'new', message: 'new' } }),
        ).rejects.toMatchObject({ code: 'INVALID_UNIQUE_SELECTOR' });
        await expect(repository.count()).resolves.toBe(0);
      });
    },
    'portable database contracts',
  );
}

export type { DatabaseIntegrationContext };
