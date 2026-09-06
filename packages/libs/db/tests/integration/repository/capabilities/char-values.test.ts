import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../../helpers.js';

describeIntegrationDatabases('CHAR field contract', (context) => {
  it('widens CHAR storage and preserves data through an explicit alteration', async () => {
    await context.builder.createCollection('widths', (c) => {
      c.string('key').primary();
      c.char('value', { length: 2 }).nullable();
    });
    const repo = context.database.repository('widths');
    await repo.createOne({ values: { key: 'A', value: 'AB' } });
    await context.builder.alterField('widths', 'value', { length: 4 });
    await repo.updateOne({ filter: { key: 'A' }, values: { value: 'ABCD' } });
    expect(
      await repo.findOne({
        filter: { key: 'A' },
        select: (s) => s.fields('value'),
      }),
    ).toEqual({ value: 'ABCD' });
  });
  it('reloads short CHAR identities for upsert and bulk returning', async () => {
    await context.builder.createCollection('shortKeys', (c) => {
      c.char('code', { length: 4 }).primary().notNull();
      c.string('label');
    });
    const repo = context.database.repository('shortKeys');
    const created = await repo.createMany({
      values: [
        { code: 'A', label: 'first' },
        { code: 'B', label: 'second' },
      ],
      select: (s) => s.fields('code', 'label'),
    });
    expect(created.records.map((record) => record.label)).toEqual([
      'first',
      'second',
    ]);
    const updated = await repo.upsertOne({
      filter: { code: 'A' },
      create: { code: 'A', label: 'unused' },
      update: { label: 'updated' },
      select: (s) => s.fields('label'),
    });
    expect(updated.record).toEqual({ label: 'updated' });
  });

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

  it('supports relation keys and metadata-only alterations without changing storage', async () => {
    await context.builder.createCollection('parents', (c) => {
      c.char('code', { length: 4 }).primary();
    });
    await context.builder.createCollection('children', (c) => {
      c.string('key').primary();
      c.char('parentCode', { length: 4 });
      c.belongsTo('parent', 'parents')
        .foreignKey('parentCode')
        .targetKey('code');
    });
    const parents = context.database.repository('parents');
    const children = context.database.repository('children');
    await parents.createOne({ values: { code: 'A001' } });
    await children.createOne({
      values: { key: 'child', parent: (r) => r.connect({ code: 'A001' }) },
    });
    expect(
      await children.findOne({
        filter: { key: 'child' },
        select: (s) =>
          s.fields('key').include('parent', (r) => r.fields('code')),
      }),
    ).toEqual({ key: 'child', parent: { code: 'A001' } });
    await context.builder.alterField('parents', 'code', {
      title: 'Parent code',
    });
    expect(
      (
        await context.database
          .connection(context.spec.name)
          .collections.get('parents')
      )?.fields,
    ).toContainEqual(
      expect.objectContaining({
        name: 'code',
        type: 'char',
        length: 4,
        title: 'Parent code',
      }),
    );
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
