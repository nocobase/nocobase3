import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../../helpers.js';

describeIntegrationDatabases('CHAR field contract', (context) => {
  it('retains logical type and native fixed-width storage through mutations and filters', async () => {
    await context.builder.createCollection('codes', (c) => {
      c.char('code', { length: 4 }).primary();
      c.char('label', { length: 8 }).nullable();
    });
    const connection = context.database.connection(context.spec.name);
    expect((await connection.collections.get('codes'))?.fields).toContainEqual(
      expect.objectContaining({ name: 'code', type: 'char', length: 4 }),
    );
    const repo = connection.repository('codes');
    await repo.createOne({ values: { code: 'A001', label: 'short' } });
    const row = await repo.findOne({
      filter: { code: 'A001', label: 'short' },
    });
    expect(row?.code).toBe('A001');
    expect(row?.label).toBe(
      ['postgres', 'oracle', 'mssql'].includes(context.spec.dialect)
        ? 'short   '
        : 'short',
    );
    await repo.updateOne({
      filter: { code: 'A001' },
      values: (v) => ({ label: v.variable('$label') }),
      context: { label: 'updated!' },
    });
    expect(
      await repo.findMany({
        filter: (f) => f.string('label').startsWith('up'),
        sort: (s) => s.field('code').asc(),
        select: (s) => s.fields('label'),
      }),
    ).toEqual([{ label: 'updated!' }]);
    expect(
      (
        await repo.deleteOne({
          filter: { code: 'A001' },
          select: (s) => s.fields('label'),
        })
      ).record,
    ).toEqual({ label: 'updated!' });
  });

  it('rejects invalid definitions and values before writes', async () => {
    for (const length of [undefined, 0, -1, 1.5, NaN]) {
      await expect(
        context.builder.createCollection('invalid', (c) =>
          c.field({ name: 'code', type: 'char', length }),
        ),
      ).rejects.toThrow();
      expect(await context.db.schema.hasTable(context.table('invalid'))).toBe(
        false,
      );
    }
    await context.builder.createCollection('codes', (c) => {
      c.string('key').primary();
      c.char('value', { length: 4 }).notNull();
    });
    const repo = context.database.repository('codes');
    for (const value of ['12345', 1, true, {}, null, 'a\0b', '\ud800'])
      await expect(
        repo.createOne({ values: { key: 'bad', value } }),
      ).rejects.toMatchObject({ code: 'INVALID_MUTATION' });
    expect(await repo.count()).toBe(0);
  });

  it('supports char keys, cursors, group keys and streaming without trimming', async () => {
    await context.builder.createCollection('codes', (c) => {
      c.char('code', { length: 4 }).primary().notNull();
    });
    const repo = context.database.repository('codes');
    await repo.createMany({ values: [{ code: 'A001' }, { code: 'A002' }] });
    expect(
      await repo.findMany({
        sort: (s) => s.field('code').asc(),
        cursor: { code: 'A001' },
      }),
    ).toEqual([{ code: 'A002' }]);
    expect(
      await repo.groupBy({
        by: ['code'],
        aggregate: (a) => ({ total: a.count() }),
        sort: (s) => s.field('code').asc(),
      }),
    ).toEqual([
      { code: 'A001', total: 1 },
      { code: 'A002', total: 1 },
    ]);
    const rows = [];
    for await (const row of repo.findMany({
      sort: (s) => s.field('code').asc(),
    }))
      rows.push(row);
    expect(rows).toEqual([{ code: 'A001' }, { code: 'A002' }]);
  });
});
