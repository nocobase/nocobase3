import { defineSeed, type SeedDefinition } from '@nocobase/db';

const seed: SeedDefinition = defineSeed({
  name: '202609020003_seed_commerce',

  async run({ query }) {
    // The portable contract is ISO-8601 with the `T`; a space separator is a
    // dialect literal the query builder no longer accepts on a temporal column.
    const createdAt = '2026-09-02T09:00:00';
    await query
      .insertInto('products')
      .values([
        {
          name: 'Mechanical Keyboard',
          sku: 'KEY-001',
          price: 129,
          stock: 18,
          createdAt,
        },
        {
          name: 'USB-C Dock',
          sku: 'DOCK-001',
          price: 189.5,
          stock: 11,
          createdAt,
        },
        {
          name: '4K Display',
          sku: 'DISPLAY-001',
          price: 699,
          stock: 7,
          createdAt,
        },
      ])
      .execute();
  },
});

export default seed;
