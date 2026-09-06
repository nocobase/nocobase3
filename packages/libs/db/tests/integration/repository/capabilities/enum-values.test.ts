import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../../helpers.js';

describeIntegrationDatabases('Enum field contract', (context) => {
  it('widens explicitly short enum storage before adding longer members', async () => {
    await context.builder.createCollection('shortDomains', (c) => {
      c.string('code').primary();
      c.enum('state', { values: ['on'], length: 2 }).notNull();
    });
    const repo = context.database.repository('shortDomains');
    await repo.createOne({ values: { code: 'A', state: 'on' } });
    await expect(
      context.builder.alterField('shortDomains', 'state', {
        values: ['on', 'off'],
      }),
    ).rejects.toThrow();
    await context.builder.alterField('shortDomains', 'state', {
      length: 4,
      values: ['on', 'off'],
    });
    await repo.updateOne({ filter: { code: 'A' }, values: { state: 'off' } });
    expect(
      await repo.findOne({
        filter: { code: 'A' },
        select: (s) => s.fields('state'),
      }),
    ).toEqual({ state: 'off' });
  });
  const values = [
    'draft',
    'DRAFT',
    'published',
    'x ',
    'x',
    '中文',
    "a'b",
    'a,b',
    '😀',
  ];
  async function setup() {
    await context.builder.createCollection('articles', (c) => {
      c.string('code').primary();
      c.enum('status', { values }).nullable().defaultTo('draft');
    });
    return context.database.repository('articles');
  }
  it('persists member metadata and performs exact equality independent of default collation', async () => {
    const repo = await setup();
    expect(
      (await context.metadataStore.get('articles'))?.document.fields?.status,
    ).toEqual({ type: 'enum', values });
    const created = await repo.createMany({
      values: [
        { code: '0', status: values[0] },
        ...values
          .slice(1)
          .map((status, i) => ({ code: String(i + 1), status })),
      ],
      select: (s) => s.fields('code', 'status'),
    });
    expect(created.records).toHaveLength(values.length);
    for (const [i, status] of values.entries()) {
      expect(
        await repo.findMany({
          filter: { status },
          select: (s) => s.fields('code'),
        }),
      ).toEqual([{ code: String(i) }]);
      expect(
        await repo.count({ filter: (f) => f.string('status').ne(status) }),
      ).toBe(values.length - 1);
    }
    expect(
      await repo.count({
        filter: (f) =>
          f.or([
            f.string('status').eq('draft'),
            f.string('status').eq('DRAFT'),
          ]),
      }),
    ).toBe(2);
    expect(
      (
        await repo.createOne({
          values: { code: 'default' },
          select: (s) => s.fields('status'),
        })
      ).record,
    ).toEqual({ status: 'draft' });
  });
  it('rejects invalid definitions before DDL', async () => {
    for (const members of [
      [],
      ['x', 'x'],
      [''],
      ['x\0'],
      ['\ud800'],
      ['x'.repeat(256)],
    ]) {
      await expect(
        context.builder.createCollection('invalid', (c) =>
          c.enum('status', { values: members }),
        ),
      ).rejects.toThrow();
      expect(await context.db.schema.hasTable(context.table('invalid'))).toBe(
        false,
      );
    }
    await expect(
      context.builder.createCollection('invalid', (c) =>
        c.enum('status', { values: ['x'], defaultValue: 'bad' }),
      ),
    ).rejects.toThrow();
    await expect(
      context.builder.createCollection('invalid', (c) =>
        c.field({ name: 'status', type: 'string', values: ['x'] }),
      ),
    ).rejects.toThrow();
  });
  it('validates literals, variables, nulls, filters and batch returning', async () => {
    const repo = await setup();
    for (const status of ['missing', 1, true, {}, ['draft']]) {
      await expect(
        repo.createOne({ values: { code: 'bad', status } }),
      ).rejects.toMatchObject({ code: 'INVALID_MUTATION' });
      await expect(
        repo.createOne({
          values: (v) => ({ code: 'bad', status: v.variable('$status') }),
          context: { status },
        }),
      ).rejects.toMatchObject({ code: 'INVALID_MUTATION' });
    }
    await expect(
      repo.findMany({ filter: { status: 'missing' } }),
    ).rejects.toMatchObject({ code: 'INVALID_FILTER' });
    await expect(
      repo.findMany({ filter: (f) => f.string('status').includes('draft') }),
    ).rejects.toMatchObject({ code: 'FIELD_CAPABILITY_NOT_SUPPORTED' });
    await expect(
      repo.findMany({ sort: (s) => s.field('status').asc() }),
    ).rejects.toMatchObject({ code: 'FIELD_CAPABILITY_NOT_SUPPORTED' });
    await repo.createMany({
      values: [
        { code: 'A', status: null },
        { code: 'B', status: 'draft' },
      ],
    });
    expect(await repo.count({ filter: { status: null } })).toBe(1);
    expect(
      await repo.count({ filter: (f) => f.string('status').ne('draft') }),
    ).toBe(0);
    expect(
      (
        await repo.updateMany({
          all: true,
          values: { status: 'published' },
          select: (s) => s.fields('status'),
        })
      ).records,
    ).toEqual([{ status: 'published' }, { status: 'published' }]);
    expect(
      (
        await repo.deleteOne({
          filter: { code: 'A' },
          select: (s) => s.fields('status'),
        })
      ).record,
    ).toEqual({ status: 'published' });
  });
  it('allows additive member updates, preserves title patches and rejects destructive domain changes', async () => {
    const repo = await setup();
    const metadata = context.database.connection(
      context.spec.name,
    ).collectionMetadata;
    await metadata.updateField('articles', 'status', { title: 'Status' });
    await context.builder.alterField('articles', 'status', {
      values: [...values, 'archived'],
    });
    expect(
      (await context.metadataStore.get('articles'))?.document.fields?.status
        ?.values,
    ).toEqual([...values, 'archived']);
    await repo.createOne({ values: { code: 'A', status: 'archived' } });
    await expect(
      metadata.updateField('articles', 'status', { values }),
    ).rejects.toThrow('Removing or renaming');
    await expect(
      context.builder.alterField('articles', 'status', { values }),
    ).rejects.toThrow('Removing or renaming');
    await expect(
      metadata.updateField('articles', 'status', { values: null }),
    ).rejects.toThrow();
    expect(
      await repo.findOne({
        filter: { code: 'A' },
        select: (s) => s.fields('status'),
      }),
    ).toEqual({ status: 'archived' });
    await context.builder.dropField('articles', 'status');
    expect(
      (await context.metadataStore.get('articles'))?.document.fields?.status,
    ).toBeUndefined();
  });
  it('validates nested mutations, relation filters, returning and counts', async () => {
    const repo = await setup();
    await context.builder.addField('articles', {
      name: 'authorCode',
      type: 'string',
    });
    await context.builder.createCollection('authors', (c) => {
      c.string('code').primary();
      c.hasMany('articles', 'articles')
        .sourceKey('code')
        .foreignKey('authorCode');
    });
    const authors = context.database.repository('authors');
    await authors.createOne({
      values: {
        code: 'P',
        articles: (r) =>
          r
            .create({ code: 'A', status: 'DRAFT' })
            .create({ code: 'B', status: 'draft' }),
      },
    });
    expect(
      await authors.findOne({
        filter: { code: 'P' },
        select: (s) =>
          s
            .fields('code')
            .include('articles', (r) =>
              r.fields('status').filter({ status: 'draft' }),
            ),
      }),
    ).toEqual({ code: 'P', articles: [{ status: 'draft' }] });
    await expect(
      authors.updateOne({
        filter: { code: 'P' },
        values: {
          articles: (r) =>
            r.update({ filter: { code: 'A' }, values: { status: 'invalid' } }),
        },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_MUTATION' });
    expect(
      await repo.aggregate({
        aggregate: (a) => ({ total: a.count('status') }),
      }),
    ).toEqual({ total: 2 });
    await expect(
      repo.groupBy({
        by: ['status'],
        aggregate: (a) => ({ total: a.count() }),
      }),
    ).rejects.toMatchObject({ code: 'FIELD_CAPABILITY_NOT_SUPPORTED' });
    await expect(
      context.builder.addConstraint('articles', {
        type: 'unique',
        fields: ['status'],
      }),
    ).rejects.toThrow('identity');
  });

  it('validates external stored values and streams valid members', async () => {
    const repo = await setup();
    await repo.createOne({ values: { code: 'A', status: 'published' } });
    const rows = [];
    for await (const row of repo.findMany({
      select: (s) => s.fields('status'),
    }))
      rows.push(row);
    expect(rows).toEqual([{ status: 'published' }]);
    await context
      .db(context.table('articles'))
      .where({ code: 'A' })
      .update({ status: 'corrupt' });
    await expect(
      repo.findMany({ select: (s) => s.fields('status') }),
    ).rejects.toMatchObject({ code: 'INVALID_STORED_VALUE' });
    expect(await repo.findMany({ select: (s) => s.fields('code') })).toEqual([
      { code: 'A' },
    ]);
  });
});
