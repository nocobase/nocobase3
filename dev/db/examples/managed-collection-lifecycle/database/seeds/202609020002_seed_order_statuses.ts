import { defineSeed, type SeedDefinition } from '@nocobase/db';

const seed: SeedDefinition = defineSeed({
  name: '202609020002_seed_order_statuses',

  async run({ query }) {
    await query
      .insertInto('orderStatuses')
      .values([
        { code: 'draft', title: 'Draft' },
        { code: 'paid', title: 'Paid' },
        { code: 'cancelled', title: 'Cancelled' },
      ])
      .execute();
  },
});

export default seed;
