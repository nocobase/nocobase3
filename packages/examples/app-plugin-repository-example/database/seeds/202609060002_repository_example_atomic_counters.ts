import { defineSeed, type SeedDefinition } from '@nocobase/db';

const seed: SeedDefinition = defineSeed({
  name: '202609060002_repository_example_atomic_counters',
  transaction: true,
  async run({ query }) {
    for (const record of [
      { id: 'demo-stock', name: 'Warehouse stock', value: 120 },
      { id: 'demo-wallet', name: 'Account balance (cents)', value: 50000 },
      { id: 'demo-points', name: 'Reward points', value: 100 },
      { id: 'demo-visits', name: 'Visit counter', value: 0 },
    ]) {
      const existing = await query
        .selectFrom('repositoryExampleAtomicCounters')
        .select('id')
        .where('id', '=', record.id)
        .executeTakeFirst();
      if (!existing)
        await query
          .insertInto('repositoryExampleAtomicCounters')
          .values(record)
          .execute();
    }
  },
});
export default seed;
