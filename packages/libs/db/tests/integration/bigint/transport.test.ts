import { beforeEach, expect, it } from 'vitest';
import {
  describeIntegrationDatabases,
  type IntegrationTestContext,
} from '../helpers.js';

// SQL-side text checks verify storage independently of the driver codec.
async function storedAmount(
  context: IntegrationTestContext,
  key: string,
): Promise<string | null> {
  const projection =
    context.spec.dialect === 'oracle'
      ? 'to_char(??) as ??'
      : context.spec.dialect === 'mysql'
        ? 'cast(?? as char) as ??'
        : 'cast(?? as varchar(100)) as ??';
  const row = await context
    .db(context.table('bigintValues'))
    .where('key', key)
    .select(context.db.raw(projection, ['amount', 'amount']))
    .first<{ amount: string | null }>();
  expect(row).toBeDefined();
  return row!.amount;
}

const samples = [
  { label: 'zero', input: 0, exact: '0' },
  {
    label: 'safe maximum',
    input: Number.MAX_SAFE_INTEGER,
    exact: '9007199254740991',
  },
  {
    label: 'safe minimum',
    input: Number.MIN_SAFE_INTEGER,
    exact: '-9007199254740991',
  },
  {
    label: 'positive unsafe-range string',
    input: '9007199254740993',
    exact: '9007199254740993',
  },
  {
    label: 'negative unsafe-range string',
    input: '-9007199254740993',
    exact: '-9007199254740993',
  },
  {
    label: '18-digit maximum',
    input: '999999999999999999',
    exact: '999999999999999999',
  },
  {
    label: '18-digit minimum',
    input: '-999999999999999999',
    exact: '-999999999999999999',
  },
  { label: 'null', input: null, exact: null },
];

describeIntegrationDatabases('BigInt precise string transport', (context) => {
  beforeEach(async () => {
    await context.builder.createCollection('bigintValues', (c) => {
      c.string('key').primary().notNull();
      c.bigInt('amount').nullable();
    });
  });

  it.each(samples)(
    'stores and returns $label as an exact string',
    async ({ input, exact }) => {
      const repository = context.database.repository('bigintValues');
      const expected = { key: 'A', amount: exact };
      const created = await repository.createOne({
        values: { key: 'A', amount: input },
      });
      expect(created.record).toEqual(expected);
      expect(await storedAmount(context, 'A')).toBe(exact);
      expect(await repository.findOne({ filter: { key: 'A' } })).toEqual(
        expected,
      );
      const query = context.database.query();
      expect(
        await query
          .selectFrom('bigintValues')
          .selectAll()
          .where('key', '=', 'A')
          .execute(),
      ).toEqual([expected]);
      if (exact !== null) {
        expect(
          await query
            .selectFrom('bigintValues')
            .select('key')
            .where('amount', '=', exact)
            .execute(),
        ).toEqual([{ key: 'A' }]);
      }
      await repository.createOne({ values: { key: 'B', amount: null } });
      expect(
        (
          await repository.updateOne({
            filter: { key: 'B' },
            values: { amount: input },
          })
        ).record,
      ).toEqual({ ...expected, key: 'B' });
      expect(await storedAmount(context, 'B')).toBe(exact);
      expect(
        await repository.deleteOne({
          filter: { key: 'A' },
          select: (s) => s.fields('key', 'amount'),
        }),
      ).toEqual({
        deleted: true,
        record: expected,
      });
      expect(
        await repository.findOne({ filter: { key: 'A' } }),
      ).toBeUndefined();
    },
  );

  it.each([9007199254740993n, -9007199254740993n])(
    'characterizes native bigint binding for %s',
    async (amount) => {
      const repository = context.database.repository('bigintValues');
      const create = () =>
        repository.createOne({ values: { key: 'A', amount } });
      const find = () =>
        context.database
          .query()
          .selectFrom('bigintValues')
          .select('key')
          .where('amount', '=', amount)
          .execute();
      if (context.spec.dialect === 'mssql') {
        // Knex currently binds native bigint as a string parameter without
        // converting the value, which tedious rejects before executing SQL.
        expect((await create()).record.amount).toBe(String(amount));
        expect(await storedAmount(context, 'A')).toBe(String(amount));
        await expect(find()).rejects.toThrow(
          /Validation failed for parameter.*Invalid string/,
        );
        expect(await repository.count()).toBe(1);
      } else {
        expect((await create()).record.amount).toBe(String(amount));
        expect(await storedAmount(context, 'A')).toBe(String(amount));
        expect(await find()).toEqual([{ key: 'A' }]);
      }
    },
  );

  it.each(['9223372036854775807', '-9223372036854775808'])(
    'checks the physical range for %s',
    async (amount) => {
      const repository = context.database.repository('bigintValues');
      const create = () =>
        repository.createOne({ values: { key: 'A', amount } });
      if (context.spec.dialect === 'oracle') {
        // Builder maps bigInt to NUMBER(18, 0), not the full signed 64-bit range.
        await expect(create()).rejects.toThrow(/ORA-01438/);
        expect(await repository.count()).toBe(0);
      } else {
        expect((await create()).record.amount).toBe(amount);
        expect(await storedAmount(context, 'A')).toBe(amount);
      }
    },
  );

  it.each([2, '2', 2n])(
    'checks stored arithmetic and returned values for increment %s',
    async (increment) => {
      const repository = context.database.repository('bigintValues');
      await repository.createOne({
        values: { key: 'A', amount: '9007199254740993' },
      });
      const updated = await repository.updateOne({
        filter: { key: 'A' },
        values: { amount: { increment } },
      });
      const stored = '9007199254740995';
      expect(await storedAmount(context, 'A')).toBe(stored);
      expect(updated.record.amount).toBe(stored);
    },
  );

  it('distinguishes adjacent exact values in Query predicates and numeric ordering', async () => {
    const query = context.database.query();
    await query
      .insertInto('bigintValues')
      .values([
        { key: 'A', amount: '9007199254740992' },
        { key: 'B', amount: '9007199254740993' },
        { key: 'C', amount: '-9007199254740993' },
      ])
      .execute();
    for (const [key, amount] of [
      ['A', '9007199254740992'],
      ['B', '9007199254740993'],
      ['C', '-9007199254740993'],
    ]) {
      expect(await storedAmount(context, key!)).toBe(amount);
      expect(
        await query
          .selectFrom('bigintValues')
          .select('key')
          .where('amount', '=', amount)
          .execute(),
      ).toEqual([{ key }]);
    }
    expect(
      await query
        .selectFrom('bigintValues')
        .select('key')
        .orderBy('amount', 'asc')
        .execute(),
    ).toEqual([{ key: 'C' }, { key: 'A' }, { key: 'B' }]);
  });

  it('rejects unsafe expression writes and accepts exact-string Repository filters', async () => {
    const repository = context.database.repository('bigintValues');
    for (const amount of [
      Number.MAX_SAFE_INTEGER + 1,
      Number.MIN_SAFE_INTEGER - 1,
      1.5,
      Infinity,
      NaN,
      '1.5',
      'invalid',
    ]) {
      await expect(
        repository.createOne({
          values: { key: 'A', amount: { kind: 'literal', value: amount } },
        }),
      ).rejects.toMatchObject({ code: 'INVALID_MUTATION' });
    }
    expect(await repository.count()).toBe(0);
    await repository.createOne({
      values: { key: 'A', amount: '9007199254740993' },
    });
    await expect(
      repository.findOne({ filter: { amount: '9007199254740993' } }),
    ).resolves.toMatchObject({ amount: '9007199254740993' });
  });
  it.each([Number.MAX_SAFE_INTEGER + 1, Number.MIN_SAFE_INTEGER - 1])(
    'rejects plain unsafe number input %s',
    async (amount) => {
      const repository = context.database.repository('bigintValues');
      const create = () =>
        repository.createOne({ values: { key: 'A', amount } });
      await expect(create()).rejects.toMatchObject({
        code: 'INVALID_MUTATION',
      });
      expect(await repository.count()).toBe(0);
    },
  );
  it('preserves aliases, joins, streams, relations, and nested transactions', async () => {
    await context.builder.createCollection('bigintParents', (c) => {
      c.bigInt('key').primary().notNull();
      c.integer('quantity');
    });
    await context.builder.createCollection('bigintChildren', (c) => {
      c.string('key').primary().notNull();
      c.bigInt('parentKey');
      c.belongsTo('parent', 'bigintParents')
        .foreignKey('parentKey')
        .targetKey('key');
    });
    await context.builder.alterCollection('bigintParents', (c) => {
      c.hasMany('children', 'bigintChildren')
        .sourceKey('key')
        .foreignKey('parentKey');
    });
    const key = '9007199254740993';
    await context.database.transaction(async (connection) => {
      await connection
        .repository('bigintParents')
        .createOne({ values: { key, quantity: 7 } });
      await connection.transaction(async (nested) => {
        await nested
          .repository('bigintChildren')
          .createOne({ values: { key: 'C', parentKey: key } });
        expect(
          await nested.query
            .selectFrom('bigintParents as p')
            .select(['p.key as externalKey', 'p.quantity'])
            .execute(),
        ).toEqual([{ externalKey: key, quantity: 7 }]);
      });
      const parents = connection.repository('bigintParents');
      const selection = parents.findMany({
        select: (s) =>
          s
            .fields('key', 'quantity')
            .include('children', (c) => c.fields('key', 'parentKey')),
      });
      const expected = [
        { key, quantity: 7, children: [{ key: 'C', parentKey: key }] },
      ];
      expect(await selection).toEqual(expected);
      const streamed = [];
      for await (const row of parents.findMany({
        select: (s) =>
          s
            .fields('key', 'quantity')
            .include('children', (c) => c.fields('key', 'parentKey')),
      }))
        streamed.push(row);
      expect(streamed).toEqual(expected);
      const scalarStream = [];
      for await (const row of parents.findMany()) scalarStream.push(row);
      expect(scalarStream).toEqual([{ key, quantity: 7 }]);
      expect(
        await connection.query
          .selectFrom('bigintChildren as c')
          .innerJoin('bigintParents as p', 'p.key', 'c.parentKey')
          .select(['p.key as parentKey', 'p.quantity'])
          .execute(),
      ).toEqual([{ parentKey: key, quantity: 7 }]);
    });
  });
});
