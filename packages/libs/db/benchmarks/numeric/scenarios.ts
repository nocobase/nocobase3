import assert from 'node:assert/strict';
import {
  aggregateProjection,
  aggregateSql,
} from '../../src/numeric/aggregate.js';
import type { Knex } from 'knex';
import type { DatabaseConnection } from '../../src/index.js';
import type { Scenario } from './measure.js';

const values = ['intv', 'bigv', 'decv', 'floatv', 'doublev'] as const;
export const fixtureNames = ['numeric', 'writeint', 'writedec'] as const;
export function fixtureRow(id: number) {
  return {
    id,
    intv: id % 100,
    bigv: '9007199254740993',
    decv: `${id % 100}.25`,
    floatv: (id % 100) + 0.25,
    doublev: (id % 100) + 0.25,
    groupfew: id % 10,
    groupmany: id % 10000,
  };
}

export async function setup(
  connection: DatabaseConnection,
  client: Knex,
  prefix: string,
  rows: number,
): Promise<void> {
  await connection.builder.createCollection('numeric', (c) => {
    c.integer('id').primary();
    c.integer('intv');
    c.bigInt('bigv');
    c.decimal('decv', { precision: 20, scale: 2 });
    c.float('floatv');
    c.double('doublev');
    c.integer('groupfew');
    c.integer('groupmany');
  });
  for (const type of ['integer', 'decimal'] as const) {
    await connection.builder.createCollection(
      type === 'integer' ? 'writeint' : 'writedec',
      (c) => {
        c.string('code').primary();
        if (type === 'integer') c.integer('value');
        else c.decimal('value', { precision: 20, scale: 2 });
      },
    );
  }
  // Small portable chunks respect SQLite compound SELECT and SQL Server binding limits.
  await client.transaction(async (trx) => {
    for (let start = 0; start < rows; start += 100) {
      await trx(`${prefix}numeric`).insert(
        Array.from({ length: Math.min(100, rows - start) }, (_, i) =>
          fixtureRow(start + i),
        ),
      );
    }
  });
  await connection.collections.get('numeric');
}

function records(result: unknown): Record<string, unknown>[] {
  assert.ok(Array.isArray(result));
  return result as Record<string, unknown>[];
}
export function scenarios(
  connection: DatabaseConnection,
  client: Knex,
  prefix: string,
  rows: number,
  writeSizes: number[],
): Scenario[] {
  const output: Scenario[] = [];
  const warm = () =>
    connection.collections.get('numeric').then(() => undefined);
  const cold = () => connection.collections.invalidate('numeric');
  for (const page of [100, 1000].filter((size) => size <= rows)) {
    for (const selection of ['integer', 'mixed'] as const) {
      const fields =
        selection === 'integer' ? ['id', 'intv'] : ['id', ...values];
      for (const api of ['knex', 'query', 'repository'] as const) {
        for (const cache of api === 'knex' ? ['warm'] : ['warm', 'cold']) {
          output.push({
            name: `read/${selection}/${page}/${cache}`,
            api,
            prepare: cache === 'cold' ? cold : warm,
            run: async () => {
              if (api === 'knex')
                return await client(`${prefix}numeric`)
                  .select(fields)
                  .where('id', '>=', 0)
                  .orderBy('id')
                  .limit(page);
              if (api === 'query')
                return await connection.query
                  .selectFrom('numeric')
                  .select(fields)
                  .where('id', '>=', 0)
                  .orderBy('id')
                  .limit(page)
                  .execute();
              return await connection.repository('numeric').findMany({
                select: (s) => s.fields(...fields),
                filter: (f) => f.number('id').gte(0),
                sort: (s) => s.field('id').asc(),
                limit: page,
              });
            },
            verify: (result) => {
              const data = records(result);
              assert.equal(data.length, page);
              for (let i = 0; i < page; i++) {
                assert.equal(Number(data[i].id), i);
                assert.equal(data[i].intv, i % 100);
                if (selection === 'mixed') {
                  assert.equal(String(data[i].bigv), '9007199254740993');
                  assert.equal(Number(data[i].decv), (i % 100) + 0.25);
                  assert.equal(data[i].floatv, (i % 100) + 0.25);
                  assert.equal(data[i].doublev, (i % 100) + 0.25);
                  if (api !== 'knex') {
                    assert.equal(typeof data[i].bigv, 'string');
                    assert.equal(typeof data[i].decv, 'string');
                  }
                }
              }
            },
          });
        }
      }
    }
  }
  for (const api of ['knex', 'query', 'repository'] as const) {
    output.push({
      name: 'aggregate/count',
      api,
      prepare: warm,
      run: async () => {
        if (api === 'knex')
          return await client(`${prefix}numeric`).count({ total: '*' });
        if (api === 'query')
          return await connection.query
            .selectFrom('numeric')
            .select((eb) => [eb.fn.countAll().as('total')])
            .execute();
        return [{ total: await connection.repository('numeric').count() }];
      },
      verify: (result) => {
        const total = records(result)[0].total;
        assert.equal(Number(total), rows);
        if (api !== 'knex') assert.equal(typeof total, 'number');
      },
    });
    for (const field of ['intv', 'decv', 'floatv', 'doublev']) {
      let expected = 0;
      for (let i = 0; i < rows; i++) expected += i % 100;
      if (field !== 'intv') expected += rows * 0.25;
      output.push({
        name: `aggregate/sum-avg/${field}`,
        api,
        accuracy: (result) => {
          const row = records(result)[0];
          return {
            expectedTotal: expected,
            expectedAverage: expected / rows,
            totalError: Number(row.total) - expected,
            averageError: Number(row.average) - expected / rows,
            totalRelativeError:
              expected === 0 ? 0 : (Number(row.total) - expected) / expected,
          };
        },
        prepare: warm,
        run: async () => {
          if (api === 'knex')
            return await client(`${prefix}numeric`)
              .sum({ total: field })
              .avg({ average: field });
          if (api === 'query')
            return await connection.query
              .selectFrom('numeric')
              .select((eb) => [
                eb.fn.sum(field).as('total'),
                eb.fn.avg(field).as('average'),
              ])
              .execute();
          return [
            await connection.repository('numeric').aggregate({
              aggregate: (a) => ({
                total: a.sum(field),
                average: a.avg(field),
              }),
            }),
          ];
        },
        verify: (result) => {
          const row = records(result)[0];
          const floating = field === 'floatv' || field === 'doublev';
          if (floating) {
            assert.ok(Number.isFinite(Number(row.total)));
            assert.ok(Number.isFinite(Number(row.average)));
          } else assert.equal(Number(row.total), expected);
          // Native SQL Server AVG(integer) truncates; record the type/value difference.
          const expectedAvg =
            api === 'knex' && connection.dialect === 'mssql' && field === 'intv'
              ? Math.trunc(expected / rows)
              : expected / rows;
          if (!floating)
            assert.ok(Math.abs(Number(row.average) - expectedAvg) < 0.00001);
          if (api !== 'knex') {
            assert.equal(
              typeof row.total,
              field === 'floatv' || field === 'doublev' ? 'number' : 'string',
            );
            assert.equal(
              typeof row.average,
              field === 'floatv' || field === 'doublev' ? 'number' : 'string',
            );
          }
        },
      });
    }
    for (const group of ['groupfew', 'groupmany']) {
      output.push({
        name: `group-sort/${group}`,
        api,
        prepare: warm,
        run: async () => {
          if (api === 'knex')
            return await client(`${prefix}numeric`)
              .select(group)
              .sum({ total: 'decv' })
              .groupBy(group)
              .orderBy('total')
              .orderBy(group);
          if (api === 'query')
            return await connection.query
              .selectFrom('numeric')
              .select(group)
              .select((eb) => [eb.fn.sum('decv').as('total')])
              .groupBy(group)
              .orderBy('total')
              .orderBy(group)
              .execute();
          return await connection.repository('numeric').groupBy({
            by: [group],
            aggregate: (a) => ({ total: a.sum('decv') }),
            sort: (s) => [s.field('total').asc(), s.field(group).asc()],
          });
        },
        verify: (result) => {
          const data = records(result);
          const divisor = group === 'groupfew' ? 10 : 10000;
          assert.equal(data.length, Math.min(rows, divisor));
          const totals = new Map<number, number>();
          for (let i = 0; i < rows; i++)
            totals.set(
              i % divisor,
              (totals.get(i % divisor) ?? 0) + (i % 100) + 0.25,
            );
          let last = -Infinity;
          for (const row of data) {
            const total = Number(row.total);
            assert.equal(total, totals.get(Number(row[group])));
            assert.ok(total >= last);
            last = total;
          }
        },
      });
    }
  }
  for (const size of writeSizes) {
    for (const type of ['integer', 'decimal'] as const) {
      const name = type === 'integer' ? 'writeint' : 'writedec';
      const input = Array.from({ length: size }, (_, id) => ({
        code: String(id),
        value: type === 'integer' ? 42 : '42.25',
      }));
      output.push({
        name: `createMany/${type}/${size}`,
        api: 'repository',
        prepare: async () => {
          await client(`${prefix}${name}`).delete();
          await connection.collections.get(name);
        },
        run: async () =>
          await connection.repository(name).createMany({
            values: [input[0], ...input.slice(1)],
            select: (s) => s.fields('code', 'value'),
          }),
        verify: (result) => {
          const value = result as {
            records: Record<string, unknown>[];
            createdCount: number;
          };
          assert.equal(value.createdCount, size);
          assert.equal(value.records.length, size);
          for (const row of value.records)
            assert.equal(row.value, type === 'integer' ? 42 : '42.25');
        },
      });
    }
  }
  output.push({
    name: 'control/count-projection',
    api: 'knex',
    prepare: warm,
    run: async () =>
      await client(`${prefix}numeric`).select(
        client.raw('? as ??', [
          aggregateProjection(client, aggregateSql(client, 'count', '*')),
          'total',
        ]),
      ),
    verify: (result) => assert.equal(Number(records(result)[0].total), rows),
  });
  output.push({
    name: 'control/integer-page-null-order',
    api: 'knex',
    prepare: warm,
    run: async () =>
      await client(`${prefix}numeric`)
        .select('id', 'intv')
        .where('id', '>=', 0)
        .orderByRaw('case when ?? is null then 1 else 0 end asc', ['id'])
        .orderBy('id')
        .limit(100),
    verify: (result) => {
      const data = records(result);
      assert.equal(data.length, Math.min(100, rows));
      data.forEach((row, i) => assert.equal(Number(row.id), i));
    },
  });
  return output;
}
