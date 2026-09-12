import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../../helpers.js';

describeIntegrationDatabases('Repository temporal contract', (context) => {
  async function setup() {
    await context.builder.createCollection('events', (c) => {
      c.string('code').primary();
      c.date('day').nullable();
      c.time('clock').nullable();
      c.datetime('local').nullable();
      c.datetimeTz('instant').notNull();
    });
    return context.database.repository('events');
  }

  it('round-trips local components and UTC instants through mutations, filters and cursors', async () => {
    const repo = await setup();
    const select = {
      kind: 'select',
      version: 1,
      root: {
        kind: 'selection',
        fields: ['code', 'day', 'clock', 'local', 'instant'],
      },
    } as const;
    const values = {
      code: 'A',
      day: '2024-02-29',
      clock: '09:30:00.12',
      local: '2026-09-06T09:30:00',
      instant: '2026-09-06T09:30:00+08:00',
    };
    const expected = {
      code: 'A',
      day: '2024-02-29',
      clock: '09:30:00.120',
      local: '2026-09-06T09:30:00.000',
      instant: '2026-09-06T01:30:00.000Z',
    };
    await repo.createOne({ values });
    expect(await repo.findOne({ filter: { code: 'A' }, select })).toEqual(
      expected,
    );
    await repo.createOne({
      values: { code: 'B', instant: new Date('2026-09-06T02:30:00Z') },
    });
    expect(
      await repo.findMany({
        filter: (f) => f.date('instant').before('2026-09-06T10:00:00+08:00'),
        select: (s) => s.fields('code'),
      }),
    ).toEqual([{ code: 'A' }]);
    expect(
      await repo.findMany({
        filter: (f) => f.date('local').notAfter('2026-09-06T09:30:00'),
        select: (s) => s.fields('code'),
      }),
    ).toEqual([{ code: 'A' }]);
    expect(
      await repo.findMany({
        sort: (s) => [s.field('instant').asc(), s.field('code').asc()],
        cursor: { instant: expected.instant, code: 'A' },
        select: (s) => s.fields('code'),
      }),
    ).toEqual([{ code: 'B' }]);
    const aggregate = await repo.aggregate({
      aggregate: (a) => ({
        first: a.min('instant'),
        lastLocal: a.max('local'),
      }),
    });
    expect(aggregate).toEqual({
      first: expected.instant,
      lastLocal: expected.local,
    });
    const grouped = await repo.groupBy({
      by: ['day'],
      aggregate: (a) => ({ first: a.min('instant') }),
      filter: { code: 'A' },
    });
    expect(grouped).toEqual([{ day: expected.day, first: expected.instant }]);
    await repo.updateOne({
      filter: { code: 'A' },
      values: { instant: '2040-01-01T00:00:00Z' },
    });
    expect(
      await repo.findOne({
        filter: { code: 'A' },
        select: (s) => s.fields('instant'),
      }),
    ).toEqual({ instant: '2040-01-01T00:00:00.000Z' });
  });

  it('rejects invalid literals and variables without writing', async () => {
    const repo = await setup();
    for (const value of [
      '2026-02-29T09:00:00Z',
      '2026-09-06T09:00:00',
      '2026-09-06T09:00:00.1234Z',
    ]) {
      await expect(
        repo.createOne({ values: { code: 'bad', instant: value } }),
      ).rejects.toMatchObject({ code: 'INVALID_MUTATION' });
      await expect(
        repo.createOne({
          values: (v) => ({ code: 'bad', instant: v.variable('$when') }),
          context: { when: value },
        }),
      ).rejects.toMatchObject({ code: 'INVALID_MUTATION' });
      await expect(
        repo.findMany({ filter: (f) => f.date('instant').before(value) }),
      ).rejects.toMatchObject({ code: 'INVALID_FILTER' });
    }
    await expect(
      repo.createOne({ values: { code: 'bad', local: new Date() } }),
    ).rejects.toMatchObject({ code: 'INVALID_MUTATION' });
    expect(await repo.count()).toBe(0);
  });

  it('uses the same canonical values for returning, distinct and streaming', async () => {
    const repo = await setup();
    const instant = '2026-09-06T01:30:00.000Z';
    const created = await repo.createMany({
      values: [
        { code: 'A', instant },
        { code: 'B', instant },
      ],
      select: (s) => s.fields('code', 'instant'),
    });
    expect(created.records).toEqual([
      { code: 'A', instant },
      { code: 'B', instant },
    ]);
    expect(
      await repo.findMany({
        distinct: ['instant'],
        sort: (s) => [s.field('instant').asc(), s.field('code').asc()],
        select: (s) => s.fields('code', 'instant'),
      }),
    ).toEqual([{ code: 'A', instant }]);
    const records = [];
    for await (const row of repo.findMany({
      sort: (s) => s.field('code').asc(),
      select: (s) => s.fields('instant'),
    }))
      records.push(row);
    expect(records).toEqual([{ instant }, { instant }]);
    const updated = await repo.updateMany({
      all: true,
      values: { local: '2026-09-06T09:00:00' },
      select: (s) => s.fields('code', 'local'),
    });
    expect(updated.records).toEqual([
      { code: 'A', local: '2026-09-06T09:00:00.000' },
      { code: 'B', local: '2026-09-06T09:00:00.000' },
    ]);
    const deleted = await repo.deleteOne({
      filter: { code: 'A' },
      select: (s) => s.fields('instant'),
    });
    expect(deleted.record).toEqual({ instant });
  });

  it('returns null temporal fields and rejects unsupported precision before lossy reads', async () => {
    const repo = await setup();
    await repo.createOne({
      values: { code: 'A', instant: '2026-09-06T01:30:00Z' },
    });
    expect(
      await repo.findOne({
        filter: { code: 'A' },
        select: (s) => s.fields('day', 'clock', 'local'),
      }),
    ).toEqual({ day: null, clock: null, local: null });
    const types = {
      sqlite: 'TIMESTAMP(6)',
      postgres: 'timestamp(6) with time zone',
      mysql: 'datetime(6)',
      oracle: 'timestamp(6) with time zone',
      mssql: 'datetimeoffset(6)',
    };
    await context.db.schema.createTable(context.table('preciseEvents'), (t) => {
      t.string('code').primary();
      t.specificType('instant', types[context.spec.dialect]);
    });
    const precise = context.database.repository('preciseEvents');
    await expect(
      precise.findMany({ select: (s) => s.fields('instant') }),
    ).rejects.toMatchObject({ code: 'FIELD_CAPABILITY_NOT_SUPPORTED' });
    expect(await precise.findMany({ select: (s) => s.fields('code') })).toEqual(
      [],
    );
  });

  it('supports temporal unique selectors and upsert returning without driver Date leakage', async () => {
    const oracle = context.spec.dialect === 'oracle';
    await context.builder.createCollection('timeKeys', (c) => {
      if (oracle) c.datetime('instant').primary().notNull();
      else c.datetimeTz('instant').primary().notNull();
      c.string('label');
    });
    const repo = context.database.repository('timeKeys');
    const instant = oracle
      ? '2026-09-06T01:30:00.000'
      : '2026-09-06T01:30:00.000Z';
    const filter = {
      kind: 'filter',
      version: 1,
      root: {
        kind: 'group',
        logic: 'and',
        items: [
          {
            kind: 'condition',
            path: ['instant'],
            operator: '$eq',
            value: instant,
          },
        ],
      },
    } as const;
    const created = await repo.createOne({
      values: {
        instant: oracle ? instant : '2026-09-06T09:30:00+08:00',
        label: 'first',
      },
      select: (s) => s.fields('instant', 'label'),
    });
    expect(created.record).toEqual({ instant, label: 'first' });
    const updated = await repo.upsertOne({
      filter,
      create: { instant, label: 'unused' },
      update: { label: 'changed' },
      select: (s) => s.fields('instant', 'label'),
    });
    expect(updated.record).toEqual({ instant, label: 'changed' });
  });

  it('projects nested temporal values and relation-local cursors', async () => {
    const repo = await setup();
    await context.builder.addField('events', {
      name: 'parentCode',
      type: 'string',
      nullable: true,
    });
    await context.builder.createCollection('parents', (c) => {
      c.string('code').primary();
      c.hasMany('events', 'events').sourceKey('code').foreignKey('parentCode');
    });
    const parents = context.database.repository('parents');
    await parents.createOne({ values: { code: 'P' } });
    await repo.createMany({
      values: [
        { code: 'A', parentCode: 'P', instant: '2026-09-06T09:30:00+08:00' },
        { code: 'B', parentCode: 'P', instant: '2026-09-06T10:30:00+08:00' },
      ],
    });
    expect(
      await parents.findOne({
        filter: { code: 'P' },
        select: (s) =>
          s.fields('code').include('events', (e) =>
            e
              .fields('code', 'instant')
              .sort((s) => [s.field('instant').asc(), s.field('code').asc()])
              .cursor({ instant: '2026-09-06T01:30:00.000Z', code: 'A' })
              .limit(1),
          ),
      }),
    ).toEqual({
      code: 'P',
      events: [{ code: 'B', instant: '2026-09-06T02:30:00.000Z' }],
    });
    expect(
      await parents.findOne({
        filter: { code: 'P' },
        select: (s) =>
          s.fields('code').include('events', (e) =>
            e.combine({
              first: e.min('instant'),
              last: e.max('instant'),
              records: e
                .fields('instant')
                .sort((s) => s.field('instant').asc()),
            }),
          ),
      }),
    ).toEqual({
      code: 'P',
      events: {
        first: '2026-09-06T01:30:00.000Z',
        last: '2026-09-06T02:30:00.000Z',
        records: [
          { instant: '2026-09-06T01:30:00.000Z' },
          { instant: '2026-09-06T02:30:00.000Z' },
        ],
      },
    });
  });

  it('keeps UTC instants and zone-free values independent of database session timezone', async () => {
    const repo = await setup();
    const value = '2026-09-06T09:30:00+08:00';
    for (const zone of ['+08:00', '-05:00']) {
      await context.database
        .connection(context.spec.name)
        .transaction(async (connection) => {
          const client = await connection.client<import('knex').Knex>();
          if (context.spec.dialect === 'postgres')
            await client.raw("select set_config('TimeZone', ?, true)", [
              zone === '+08:00' ? 'Asia/Shanghai' : 'America/New_York',
            ]);
          if (context.spec.dialect === 'mysql')
            await client.raw('set time_zone = ?', [zone]);
          if (context.spec.dialect === 'oracle')
            await client.raw(`alter session set time_zone = '${zone}'`);
          try {
            const transactional = connection.repository('events');
            await transactional.createOne({
              values: {
                code: zone,
                local: '2026-09-06T09:30:00',
                instant: value,
              },
            });
            expect(
              await transactional.findOne({
                filter: { code: zone },
                select: (s) => s.fields('local', 'instant'),
              }),
            ).toEqual({
              local: '2026-09-06T09:30:00.000',
              instant: '2026-09-06T01:30:00.000Z',
            });
          } finally {
            if (context.spec.dialect === 'mysql')
              await client.raw("set time_zone = '+00:00'");
            if (context.spec.dialect === 'oracle')
              await client.raw("alter session set time_zone = '+00:00'");
          }
        });
    }
    expect(await repo.count()).toBe(2);
  });

  it('handles native MySQL TIMESTAMP columns without metadata under different session zones', async () => {
    if (context.spec.dialect !== 'mysql') return;
    await context.db.schema.createTable(
      context.table('nativeInstants'),
      (t) => {
        t.string('code').primary();
        t.specificType('instant', 'timestamp(3)').notNullable();
      },
    );
    for (const zone of ['SYSTEM', '+08:00', '-05:00']) {
      await context.database
        .connection(context.spec.name)
        .transaction(async (connection) => {
          const client = await connection.client<import('knex').Knex>();
          const previous = (await client.raw(
            'select @@session.time_zone as zone',
          )) as [[{ zone: string }], unknown];
          await client.raw('set time_zone = ?', [zone]);
          try {
            const repo = connection.repository('nativeInstants');
            await repo.createOne({
              values: { code: zone, instant: '2026-09-06T09:30:00+08:00' },
            });
            expect(
              await repo.findOne({
                filter: { code: zone },
                select: (s) => s.fields('instant'),
              }),
            ).toEqual({ instant: '2026-09-06T01:30:00.000Z' });
            expect(
              await repo.count({
                filter: (f) => f.date('instant').before('2026-09-06T02:00:00Z'),
              }),
            ).toBeGreaterThan(0);
          } finally {
            await client.raw('set time_zone = ?', [previous[0][0].zone]);
          }
        });
    }
  });

  it('rejects temporal relation join keys instead of guessing association encoding', async () => {
    await context.builder.createCollection('timeParents', (c) =>
      c.datetime('key').primary(),
    );
    await context.builder.createCollection('timeChildren', (c) => {
      c.string('code').primary();
      c.datetime('parentKey').nullable();
      c.belongsTo('parent', 'timeParents')
        .targetKey('key')
        .foreignKey('parentKey')
        .foreignKeyType('datetime');
    });
    const parent = context.database.repository('timeParents');
    await parent.createOne({ values: { key: '2026-09-06T09:00:00' } });
    const child = context.database.repository('timeChildren');
    await expect(
      child.createOne({
        values: {
          code: 'C',
          parent: { connect: { key: '2026-09-06T09:00:00' } },
        },
      }),
    ).rejects.toMatchObject({ code: 'FIELD_CAPABILITY_NOT_SUPPORTED' });
    expect(await child.count()).toBe(0);
  });
});
