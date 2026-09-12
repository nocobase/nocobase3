import { expect, it } from 'vitest';
import knex from 'knex';
import { measure, median } from '../../../benchmarks/numeric/measure.js';

it('counts executed SQL without including setup, validation, warmups or trace capture', async () => {
  const client = knex({
    client: 'better-sqlite3',
    connection: { filename: ':memory:' },
    useNullAsDefault: true,
  });
  let preparations = 0;
  let validations = 0;
  try {
    await client.schema.createTable('measurement', (table) =>
      table.integer('value'),
    );
    const result = await measure(
      client,
      {
        name: 'instrumentation',
        api: 'knex',
        prepare: async () => {
          preparations++;
          await client('measurement').delete();
          await client('measurement').insert({ value: 42 });
        },
        run: async () => {
          await client('measurement').select('value');
          return await client('measurement').select('value');
        },
        verify: (rows) => {
          validations++;
          expect(rows).toEqual([{ value: 42 }]);
        },
      },
      3,
      2,
    );
    expect(preparations).toBe(6);
    expect(validations).toBe(6);
    expect(result.samples).toHaveLength(3);
    expect(result.samples.map((s) => s.sqlCount)).toEqual([2, 2, 2]);
    expect(result.sqlCount).toEqual({ min: 2, max: 2 });
    expect(result.trace).toEqual([
      {
        sql: 'select `value` from `measurement`',
        bindingCount: 0,
        executions: 2,
      },
    ]);
    expect(result.resultTypes).toEqual({ value: 'number' });
    expect(result.resultPreview).toEqual({ value: 42 });
    expect(client.listenerCount('query')).toBe(0);
  } finally {
    await client.destroy();
  }
});

it('reports an ordinary median for odd and even sample counts', () => {
  expect(median([10, 1, 3])).toBe(3);
  expect(median([10, 1, 3, 5])).toBe(4);
});
