import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createFixture } from './helpers.js';
import { AGGREGATE_PATH, type AggregateResponse } from '../shared/aggregate.js';

let f: Awaited<ReturnType<typeof createFixture>>;
beforeEach(async () => {
  f = await createFixture();
});
afterEach(async () => {
  await f.database.destroy();
});
async function seed() {
  await f.database
    .createSeeder({
      directory: path.resolve(import.meta.dirname, '../database/seeds'),
      packageName: '@nocobase/app-plugin-repository-example',
    })
    .run();
}
async function aggregate(query: Record<string, string | number> = {}) {
  return (
    await f.api.request<{ data: AggregateResponse }>({
      path: AGGREGATE_PATH,
      query,
    })
  ).data;
}
it('aggregates all rows, groups products with names, and includes zero relation counts', async () => {
  await seed();
  const result = await aggregate();
  expect(result.summary).toEqual({
    count: 8,
    quantity: 14,
    averagePrice: 14900,
    minimumPrice: 5900,
    maximumPrice: 32900,
  });
  expect(result.statuses).toEqual(
    ['cancelled', 'confirmed', 'draft', 'paid'].map((status) => ({
      status,
      count: 1,
    })),
  );
  expect(result.products).toHaveLength(6);
  expect(
    result.products.find((row) => row.sku === 'DEMO-KEYBOARD'),
  ).toMatchObject({
    name: 'Mechanical Keyboard',
    count: 2,
    quantity: 3,
    averagePrice: 12400,
  });
  expect(result.customers.map((row) => row.orders)).toEqual([2, 1, 1, 0]);
});
it('applies status to all queries and HAVING only to grouped products', async () => {
  await seed();
  const result = await aggregate({ status: 'paid', minimumQuantity: 2 });
  expect(result.summary).toMatchObject({
    count: 3,
    quantity: 5,
    minimumPrice: 5900,
    maximumPrice: 18900,
  });
  expect(Number(result.summary.averagePrice)).toBeCloseTo(36700 / 3);
  expect(result.statuses).toEqual([{ status: 'paid', count: 1 }]);
  expect(result.products.map((row) => row.sku)).toEqual([
    'DEMO-KEYBOARD',
    'DEMO-MOUSE',
  ]);
  expect(result.customers.map((row) => row.orders)).toEqual([1, 0, 0, 0]);
  const grouped = await aggregate({ minimumQuantity: 3 });
  expect(grouped.products.map((row) => row.sku)).toEqual([
    'DEMO-KEYBOARD',
    'DEMO-MONITOR',
    'DEMO-STAND',
  ]);
  expect(grouped.summary.count).toBe(8);
});
it('preserves SQL empty-set semantics', async () => {
  expect(await aggregate()).toEqual({
    summary: {
      count: 0,
      quantity: null,
      averagePrice: null,
      minimumPrice: null,
      maximumPrice: null,
    },
    statuses: [],
    products: [],
    customers: [],
    customerLimit: 50,
  });
});
it('requires authentication, validates filters, and leaves unrelated routes public', async () => {
  expect((await f.router.request(`/main/api/${AGGREGATE_PATH}`)).status).toBe(
    401,
  );
  for (const query of [
    'status=invalid',
    'minimumQuantity=-1',
    'minimumQuantity=1.5',
    'minimumQuantity=1000001',
    'minimumQuantity=NaN',
    'minimumQuantity=',
  ]) {
    const response = await f.router.request(
      `/main/api/${AGGREGATE_PATH}?${query}`,
      { headers: { 'x-test-user': 'tester' } },
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'INVALID_INPUT' });
  }
  expect((await f.router.request('/main/api/unrelated')).status).toBe(200);
});
