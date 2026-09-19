import { beforeEach, expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../helpers.js';

describeIntegrationDatabases('Exact numeric input contract', (context) => {
  beforeEach(async () => {
    await context.builder.createCollection('numericInputs', (c) => {
      c.string('key').primary();
      c.integer('quantity').nullable();
      c.bigInt('amount').nullable();
      c.decimal('price', { precision: 30, scale: 6 }).nullable();
      c.float('ratio').nullable();
    });
  });
  const repository = () => context.database.repository('numericInputs');
  async function stored(key: string) {
    const sql =
      context.profile.numeric.exactProjection === 'toChar'
        ? 'to_char(??) as ??'
        : context.profile.numeric.exactProjection === 'castChar'
          ? 'cast(?? as char) as ??'
          : 'cast(?? as varchar(100)) as ??';
    return context
      .db(context.table('numericInputs'))
      .where('key', key)
      .select(context.db.raw(sql, ['amount', 'amount']))
      .first<{ amount: string | null }>();
  }

  it('filters exact returned strings with shorthand, typed builders, variables and ranges', async () => {
    await repository().createMany({
      values: [
        { key: 'A', amount: '9007199254740992', price: '42.125000' },
        { key: 'B', amount: '9007199254740993', price: '42.250000' },
        { key: 'C', amount: '-9007199254740993', price: '-0.125000' },
      ],
    });
    for (const [key, amount] of [
      ['A', '9007199254740992'],
      ['B', '9007199254740993'],
      ['C', '-9007199254740993'],
    ]) {
      expect(await stored(key!)).toEqual({ amount });
      expect(
        await repository().findMany({
          filter: { amount },
          select: (s) => s.fields('key'),
        }),
      ).toEqual([{ key }]);
    }
    const row = await repository().findOne({ filter: { key: 'B' } });
    if (typeof row?.price !== 'string')
      throw new Error('Expected a decimal string');
    expect(
      await repository().findOne({ filter: { price: row.price } }),
    ).toMatchObject({ key: 'B' });
    expect(
      await repository().findMany({
        filter: (f) =>
          f.and([
            f.number('amount').gte('9007199254740992'),
            f.number('amount').lt('9007199254740993'),
          ]),
        select: (s) => s.fields('key'),
      }),
    ).toEqual([{ key: 'A' }]);
    expect(
      await repository().findMany({
        filter: (f) => f.number('amount').eq(f.variable('$amount')),
        context: { amount: '9007199254740993' },
        select: (s) => s.fields('key'),
      }),
    ).toEqual([{ key: 'B' }]);
    expect(
      await repository().findMany({
        filter: (f) =>
          f.and([
            f.number('price').gt('4.2125e1'),
            f.number('price').lte('42.25'),
          ]),
        select: (s) => s.fields('key'),
      }),
    ).toEqual([{ key: 'B' }]);
  });

  it('rejects malformed filters and unsafe integer inputs before changing stored rows', async () => {
    await repository().createOne({
      values: { key: 'A', quantity: 42, amount: '42' },
    });
    for (const field of ['quantity', 'amount']) {
      for (const value of [
        Number.MAX_SAFE_INTEGER + 1,
        Number.MIN_SAFE_INTEGER - 1,
        1.5,
        NaN,
        Infinity,
        '1.5',
        'invalid',
      ]) {
        await expect(
          repository().createOne({ values: { key: 'B', [field]: value } }),
        ).rejects.toMatchObject({ code: 'INVALID_MUTATION' });
        await expect(
          repository().updateOne({
            filter: { key: 'A' },
            values: { [field]: value },
          }),
        ).rejects.toMatchObject({ code: 'INVALID_MUTATION' });
        await expect(
          repository().findMany({ filter: { [field]: value } }),
        ).rejects.toMatchObject({ code: 'INVALID_FILTER' });
      }
    }
    for (const price of ['', 'NaN', 'Infinity', '1;select', '1.2.3']) {
      await expect(
        repository().findMany({ filter: { price } }),
      ).rejects.toMatchObject({ code: 'INVALID_FILTER' });
    }
    await expect(
      repository().findMany({ filter: { ratio: '0.5' } }),
    ).rejects.toMatchObject({ code: 'INVALID_FILTER' });
    await expect(
      repository().createMany({
        values: [
          { key: 'B', amount: '1' },
          { key: 'C', amount: Number.MAX_SAFE_INTEGER + 1 },
        ],
      }),
    ).rejects.toMatchObject({ code: 'INVALID_MUTATION' });
    await expect(
      repository().updateMany({
        all: true,
        values: { amount: Number.MAX_SAFE_INTEGER + 1 },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_MUTATION' });
    expect(await repository().count()).toBe(1);
    expect(await repository().findOne({ filter: { key: 'A' } })).toMatchObject({
      quantity: 42,
      amount: '42',
    });
    expect(await stored('A')).toEqual({ amount: '42' });
  });

  it.each([2, '2', 2n])(
    'keeps arithmetic exact for operand %s and rolls back stored values',
    async (operand) => {
      for (const [operation, initial, expected] of [
        ['increment', '9007199254740993', '9007199254740995'],
        ['decrement', '-9007199254740993', '-9007199254740995'],
        ['multiply', '9007199254740993', '18014398509481986'],
        ['divide', '18014398509481986', '9007199254740993'],
      ] as const) {
        await repository().createOne({
          values: { key: operation, amount: initial },
        });
        const update = await repository().updateOne({
          filter: { key: operation },
          values: { amount: { [operation]: operand } },
        });
        expect(update.record.amount).toBe(expected);
        expect(await stored(operation)).toEqual({ amount: expected });
      }
      await expect(
        context.database.transaction(async (connection) => {
          await connection.repository('numericInputs').updateMany({
            all: true,
            values: { amount: { increment: operand } },
          });
          throw new Error('rollback');
        }),
      ).rejects.toThrow('rollback');
      expect(await stored('increment')).toEqual({ amount: '9007199254740995' });
      await repository().createOne({ values: { key: 'null', amount: null } });
      expect(
        (
          await repository().updateOne({
            filter: { key: 'null' },
            values: { amount: { multiply: operand } },
          })
        ).record.amount,
      ).toBeNull();
      expect(await stored('null')).toEqual({ amount: null });
    },
  );

  it('rejects integer arithmetic overflow without changing storage', async () => {
    await repository().createOne({
      values: { key: 'limit', amount: '999999999999999999' },
    });
    await expect(
      repository().updateMany({
        filter: { key: 'limit' },
        values: { amount: { multiply: '100' } },
      }),
    ).rejects.toThrow();
    expect(await stored('limit')).toEqual({ amount: '999999999999999999' });
    expect(
      await repository().findOne({ filter: { key: 'limit' } }),
    ).toMatchObject({ amount: '999999999999999999' });
  });

  it('compares decimal string bounds without premature rounding', async () => {
    await repository().createOne({
      values: { key: 'P', price: '1000000000000.25' },
    });
    // SQLite stores these as the same REAL; exact-decimal engines distinguish them.
    expect(
      await repository().count({ filter: { price: '1000000000000.250001' } }),
    ).toBe(context.profile.numeric.storagePrecision === 'approximate' ? 1 : 0);
    expect(
      await repository().count({ filter: { price: '1000000000000.25' } }),
    ).toBe(1);
  });

  it('updates fractional DECIMAL with exact string operands', async () => {
    await repository().createOne({
      values: { key: 'D', price: '1000000000000.25' },
    });
    const updated = await repository().updateOne({
      filter: { key: 'D' },
      values: { price: { increment: '1.25e-1' } },
    });
    expect(typeof updated.record.price).toBe('string');
    // Comparing in SQL verifies storage independently of the returned codec.
    expect(
      await context
        .db(context.table('numericInputs'))
        .where('price', '1000000000000.375')
        .select('key'),
    ).toEqual([{ key: 'D' }]);
    expect(
      await repository().count({ filter: { price: '1000000000000.375' } }),
    ).toBe(1);
    expect(String(updated.record.price).replace(/0+$/, '')).toBe(
      '1000000000000.375',
    );
  });
});
