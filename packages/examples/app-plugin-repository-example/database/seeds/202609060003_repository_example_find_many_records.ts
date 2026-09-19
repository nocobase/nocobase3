import { defineSeed, type SeedDefinition } from '@nocobase/db';

const categories = ['alpha', 'beta', 'gamma'] as const;

const seed: SeedDefinition = defineSeed({
  name: '202609060003_repository_example_find_many_records',
  transaction: true,
  async run({ query }) {
    for (let index = 1; index <= 24; index += 1) {
      const id = `find-many-${String(index).padStart(2, '0')}`;
      const existing = await query
        .selectFrom('repositoryExampleFindManyRecords')
        .select('id')
        .where('id', '=', id)
        .executeTakeFirst();
      if (!existing) {
        await query
          .insertInto('repositoryExampleFindManyRecords')
          .values({
            id,
            sequence: index,
            title: `FindMany record ${String(index).padStart(2, '0')}`,
            category: categories[(index - 1) % categories.length],
            description: `Deterministic example payload ${index}`,
          })
          .execute();
      }
    }
  },
});

export default seed;
