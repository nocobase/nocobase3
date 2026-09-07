import type { IntegrationTestContext } from '../../helpers.js';

export async function createFilterFixture(
  context: IntegrationTestContext,
): Promise<void> {
  await context.builder.createCollection('filterSamples', (c) => {
    c.string('code').primary().notNull();
    c.string('label').nullable();
    c.text('description').nullable();
    c.integer('amount').nullable();
    c.boolean('enabled').nullable();
    c.field({ name: 'day', type: 'date' }).nullable();
    c.integer('version').notNull();
    c.optimisticLock('version');
  });
  await context.db(context.table('filterSamples')).insert([
    {
      code: 'A',
      label: 'Alpha',
      description: 'Alpha',
      amount: -1,
      enabled: true,
      day: '2026-09-01',
      version: 1,
    },
    {
      code: 'B',
      label: 'Beta',
      description: 'Beta',
      amount: 0,
      enabled: false,
      day: '2026-09-02',
      version: 1,
    },
    {
      code: 'C',
      label: 'Gamma',
      description: 'Gamma',
      amount: 1,
      enabled: null,
      day: '2026-09-03',
      version: 1,
    },
    {
      code: 'D',
      label: null,
      description: null,
      amount: null,
      enabled: null,
      day: null,
      version: 1,
    },
  ]);
}
