import { createDatabaseManager } from '@nocobase/db';
import type { Knex } from 'knex';
import { describe, expect, it } from 'vitest';
import oceanbase from '../../src/index.js';

/**
 * The inspector reads a column's default as the value it was declared with, and an expression default as no value.
 * OceanBase reports `default (uuid())` and `default 'uuid()'` alike in `information_schema`, so this is the case the
 * table's DDL has to settle. The table is created in SQL because the Builder declares neither a temporal default nor
 * an expression one.
 */
describe('OceanBase column defaults', () => {
  it('reads temporal and character literals as values and expressions as none', async () => {
    const database = createDatabaseManager({
      default: 'oceanbase',
      connections: {
        oceanbase: oceanbase({
          host: process.env.OCEANBASE_HOST ?? '127.0.0.1',
          port: Number(process.env.OCEANBASE_PORT ?? 12881),
          username: process.env.OCEANBASE_USER ?? 'root@test',
          password: process.env.OCEANBASE_PASSWORD ?? 'ObTest_123456',
          database:
            process.env.OCEANBASE_DATABASE ?? 'nocobase_collection_builder',
        }),
      },
    });
    const tableName = 'inspector_column_defaults';
    try {
      const client = await database.connection().client<Knex>();
      await client.raw('drop table if exists ??', [tableName]);
      await client.raw(
        `
          create table ?? (
            id int primary key,
            day date not null default '2026-01-02',
            span time not null default '-01:30:00',
            stamp datetime(3) not null default current_timestamp(3),
            today date default (curdate()),
            token varchar(40) default (uuid()),
            spelled varchar(40) default 'uuid()',
            status varchar(20) not null default 'draft',
            word varchar(20) default 'NULL',
            optional varchar(20)
          )
        `,
        [tableName],
      );

      const collection = await database
        .connection()
        .schemaInspector.getPhysicalCollection({ tableName });
      const defaults = Object.fromEntries(
        (collection?.columns ?? []).map((column) => [
          column.columnName,
          column.default,
        ]),
      );
      expect(defaults.day).toMatchObject({ value: '2026-01-02' });
      expect(defaults.span).toMatchObject({ value: '-01:30:00' });
      expect(defaults.spelled).toMatchObject({ value: 'uuid()' });
      expect(defaults.status).toMatchObject({ value: 'draft' });
      expect(defaults.word).toMatchObject({ value: 'NULL' });
      expect(
        Object.fromEntries(
          ['stamp', 'today', 'token'].map((name) => [
            name,
            defaults[name] !== undefined && !('value' in defaults[name]),
          ]),
        ),
      ).toEqual({ stamp: true, today: true, token: true });
      expect(defaults.optional).toBeUndefined();
    } finally {
      const client = await database.connection().client<Knex>();
      await client.raw('drop table if exists ??', [tableName]);
      await database.destroy();
    }
  });
});
