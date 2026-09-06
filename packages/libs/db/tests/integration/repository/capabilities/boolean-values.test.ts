import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../../helpers.js';

describeIntegrationDatabases('Repository boolean contract', (context) => {
  async function setup() {
    await context.builder.createCollection('flags', (c) => {
      c.string('code').primary();
      c.boolean('enabled').nullable();
      c.boolean('required').notNull().defaultTo(false);
      c.integer('quantity');
    });
    return context.database.repository('flags');
  }

  it('round-trips true, false and null through mutations, filtering and returning', async () => {
    const repo = await setup();
    const created = await repo.createMany({
      values: [
        { code: 'A', enabled: true, quantity: 1 },
        { code: 'B', enabled: false, quantity: 0 },
        { code: 'C', enabled: null },
      ],
      select: (s) => s.fields('code', 'enabled', 'required'),
    });
    expect(created.records).toEqual([
      { code: 'A', enabled: true, required: false },
      { code: 'B', enabled: false, required: false },
      { code: 'C', enabled: null, required: false },
    ]);
    for (const [enabled, code] of [
      [true, 'A'],
      [false, 'B'],
      [null, 'C'],
    ] as const)
      expect(
        await repo.findMany({
          filter: { enabled },
          select: (s) => s.fields('code'),
        }),
      ).toEqual([{ code }]);
    const updated = await repo.updateOne({
      filter: { code: 'A' },
      values: (v) => ({ enabled: v.variable('$flag') }),
      context: { flag: false },
      select: (s) => s.fields('enabled', 'quantity'),
    });
    expect(updated.record).toEqual({ enabled: false, quantity: 1 });
    const deleted = await repo.deleteOne({
      filter: { code: 'A' },
      select: (s) => s.fields('enabled'),
    });
    expect(deleted.record).toEqual({ enabled: false });
  });

  it('rejects invalid literal and variable values before writing', async () => {
    const repo = await setup();
    await repo.createOne({ values: { code: 'A', enabled: true } });
    for (const value of [0, 1, 'true', 'false', '1', 2, -1, {}, []]) {
      await expect(
        repo.createOne({ values: { code: 'bad', enabled: value } }),
      ).rejects.toMatchObject({ code: 'INVALID_MUTATION' });
      await expect(
        repo.updateOne({
          filter: { code: 'A' },
          values: (v) => ({ enabled: v.variable('$flag') }),
          context: { flag: value },
        }),
      ).rejects.toMatchObject({ code: 'INVALID_MUTATION' });
    }
    await expect(
      repo.createOne({ values: { code: 'bad', required: null } }),
    ).rejects.toMatchObject({ code: 'INVALID_MUTATION' });
    expect(await repo.count()).toBe(1);
    expect(
      await repo.findOne({
        filter: { code: 'A' },
        select: (s) => s.fields('enabled'),
      }),
    ).toEqual({ enabled: true });
  });

  it('decodes grouping, distinct and streaming and binds cursor booleans', async () => {
    const repo = await setup();
    await repo.createMany({
      values: [
        { code: 'A', enabled: false, required: false },
        { code: 'B', enabled: true, required: true },
        { code: 'C', enabled: true, required: true },
      ],
    });
    expect(
      await repo.groupBy({
        by: ['enabled'],
        aggregate: (a) => ({ total: a.count() }),
        sort: (s) => s.field('enabled').asc(),
      }),
    ).toEqual([
      { enabled: false, total: 1 },
      { enabled: true, total: 2 },
    ]);
    expect(
      await repo.findMany({
        distinct: ['enabled'],
        sort: (s) => [s.field('enabled').asc(), s.field('code').asc()],
        select: (s) => s.fields('enabled'),
      }),
    ).toEqual([{ enabled: false }, { enabled: true }]);
    expect(
      await repo.findMany({
        sort: (s) => [s.field('required').asc(), s.field('code').asc()],
        cursor: { required: false, code: 'A' },
        select: (s) => s.fields('code'),
      }),
    ).toEqual([{ code: 'B' }, { code: 'C' }]);
    const rows = [];
    for await (const row of repo.findMany({
      sort: (s) => s.field('code').asc(),
      select: (s) => s.fields('enabled'),
    }))
      rows.push(row);
    expect(rows).toEqual([
      { enabled: false },
      { enabled: true },
      { enabled: true },
    ]);
  });

  it('counts boolean fields but rejects non-portable value aggregates', async () => {
    const repo = await setup();
    await repo.createMany({
      values: [
        { code: 'A', enabled: false },
        { code: 'B', enabled: null },
      ],
    });
    expect(
      await repo.aggregate({
        aggregate: (a) => ({ count: a.count('enabled') }),
      }),
    ).toEqual({ count: 1 });
    for (const kind of ['sum', 'avg', 'min', 'max'] as const) {
      await expect(
        repo.aggregate({ aggregate: (a) => ({ result: a[kind]('enabled') }) }),
      ).rejects.toMatchObject({ code: 'FIELD_CAPABILITY_NOT_SUPPORTED' });
    }
  });

  it('supports boolean unique identity through lock, upsert and batch updates', async () => {
    await context.builder.createCollection('switches', (c) => {
      c.boolean('enabled').primary().notNull();
      c.string('label');
    });
    const repo = context.database.repository('switches');
    await repo.createOne({ values: { enabled: true, label: 'initial' } });
    const result = await repo.upsertOne({
      filter: { enabled: true },
      create: { enabled: true, label: 'unused' },
      update: { label: 'updated' },
      select: (s) => s.fields('enabled', 'label'),
    });
    expect(result.record).toEqual({ enabled: true, label: 'updated' });
    const batch = await repo.updateMany({
      all: true,
      values: { label: 'batch' },
      select: (s) => s.fields('enabled', 'label'),
    });
    expect(batch.records).toEqual([{ enabled: true, label: 'batch' }]);
  });

  it('binds boolean relation keys during create, connect, update and disconnect', async () => {
    await context.builder.createCollection('states', (c) => {
      c.boolean('active').primary().notNull();
    });
    await context.builder.createCollection('items', (c) => {
      c.string('code').primary();
      c.boolean('stateKey').nullable();
      c.string('label');
      c.belongsTo('state', 'states').foreignKey('stateKey').targetKey('active');
    });
    await context.builder.addField('states', {
      name: 'items',
      type: 'hasMany',
      target: 'items',
      sourceKey: 'active',
      foreignKey: 'stateKey',
    });
    const states = context.database.repository('states');
    const items = context.database.repository('items');
    await states.createOne({ values: { active: false } });
    await items.createOne({
      values: { code: 'A', state: (r) => r.connect({ active: false }) },
    });
    await states.updateOne({
      filter: { active: false },
      values: {
        items: (r) =>
          r
            .create({ code: 'B' })
            .update({ filter: { code: 'A' }, values: { label: 'changed' } }),
      },
    });
    expect(
      await states.findOne({
        filter: { active: false },
        select: (s) =>
          s
            .fields('active')
            .include('items', (r) =>
              r
                .fields('code', 'stateKey')
                .sort((sort) => sort.field('code').asc()),
            ),
      }),
    ).toEqual({
      active: false,
      items: [
        { code: 'A', stateKey: false },
        { code: 'B', stateKey: false },
      ],
    });
    await states.updateOne({
      filter: { active: false },
      values: { items: (r) => r.disconnect({ code: 'A' }) },
    });
    expect(
      await items.findOne({
        filter: { code: 'A' },
        select: (s) => s.fields('stateKey', 'label'),
      }),
    ).toEqual({ stateKey: null, label: 'changed' });
  });

  it('preserves boolean through keys and payloads across connect, set and disconnect', async () => {
    await context.builder.createCollection('choices', (c) => {
      c.boolean('active').primary().notNull();
    });
    await context.builder.createCollection('links', (c) => {
      c.string('ownerCode').notNull();
      c.boolean('choiceKey').notNull();
      c.boolean('visible').notNull();
    });
    await context.builder.createCollection('owners', (c) => {
      c.string('code').primary();
      c.belongsToMany('choices', 'choices')
        .sourceKey('code')
        .targetKey('active')
        .through('links')
        .foreignKey('ownerCode')
        .otherKey('choiceKey');
    });
    await context.database
      .repository('choices')
      .createMany({ values: [{ active: true }, { active: false }] });
    const owners = context.database.repository('owners');
    const links = context.database.repository('links');
    await owners.createOne({
      values: {
        code: 'P',
        choices: (r) =>
          r
            .connect({ active: false }, { through: { visible: true } })
            .connect({ active: true }, { through: { visible: false } }),
      },
    });
    await owners.updateOne({
      filter: { code: 'P' },
      values: { choices: (r) => r.set([{ active: false }]) },
    });
    expect(
      await links.findMany({ select: (s) => s.fields('choiceKey', 'visible') }),
    ).toEqual([{ choiceKey: false, visible: true }]);
    await owners.updateOne({
      filter: { code: 'P' },
      values: { choices: (r) => r.disconnect({ active: false }) },
    });
    expect(await links.count()).toBe(0);
  });

  it('uses strict booleans in nested values, relation filters and projections', async () => {
    const repo = await setup();
    await context.builder.addField('flags', {
      name: 'parentCode',
      type: 'string',
    });
    await context.builder.createCollection('parents', (c) => {
      c.string('code').primary();
      c.hasMany('flags', 'flags').sourceKey('code').foreignKey('parentCode');
    });
    const parents = context.database.repository('parents');
    await parents.createOne({
      values: {
        code: 'P',
        flags: (r) =>
          r
            .create({ code: 'A', enabled: true })
            .create({ code: 'B', enabled: false }),
      },
    });
    expect(
      await parents.findOne({
        filter: { code: 'P' },
        select: (s) =>
          s
            .fields('code')
            .include('flags', (r) =>
              r.fields('code', 'enabled').filter({ enabled: true }),
            ),
      }),
    ).toEqual({ code: 'P', flags: [{ code: 'A', enabled: true }] });
    await expect(
      parents.createOne({
        values: {
          code: 'bad',
          flags: (r) => r.create({ code: 'bad', enabled: 1 }),
        },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_MUTATION' });
    expect(await parents.count()).toBe(1);
    expect(await repo.count()).toBe(2);
  });

  it('rejects invalid external storage without interpreting ordinary integers as booleans', async () => {
    await context.db.schema.createTable(context.table('externalFlags'), (t) => {
      t.string('code').primary();
      t.integer('enabled');
      t.integer('quantity');
    });
    const connection = context.database.connection(context.spec.name);
    await connection.collectionMetadata.updateField(
      'externalFlags',
      'enabled',
      { type: 'boolean' },
    );
    await context
      .db(context.table('externalFlags'))
      .insert({ code: 'bad', enabled: 2, quantity: 2 });
    const repo = connection.repository('externalFlags');
    expect(
      await repo.findMany({ select: (s) => s.fields('quantity') }),
    ).toEqual([{ quantity: 2 }]);
    await expect(
      repo.findMany({ select: (s) => s.fields('enabled') }),
    ).rejects.toMatchObject({ code: 'INVALID_STORED_VALUE' });
  });
});
