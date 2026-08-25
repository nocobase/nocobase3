import { defineSeed, type SeedDefinition } from '@nocobase/database';
import { hashPassword } from 'better-auth/crypto';

import { createSeedState } from '../store.js';

const seed: SeedDefinition = defineSeed({
  name: '202608240001_orders_demo',

  async run({ query }): Promise<void> {
    const existing = await query
      .selectFrom('app_orders_orders')
      .select('id')
      .limit(1)
      .executeTakeFirst();
    if (existing) return;

    const state = createSeedState();
    const now = new Date();
    const userId = crypto.randomUUID();
    const existingUser = await query
      .selectFrom('user')
      .select('id')
      .limit(1)
      .executeTakeFirst();
    if (!existingUser) {
      await query
        .insertInto('user')
        .values({
          id: userId,
          name: 'nocobase',
          username: 'nocobase',
          email: 'nocobase@example.com',
          emailVerified: true,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      await query
        .insertInto('account')
        .values({
          id: crypto.randomUUID(),
          issuer: 'local:credential',
          accountId: userId,
          providerId: 'credential',
          userId,
          password: await hashPassword('admin123'),
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    await query
      .insertInto('app_orders_meta')
      .values({ key: 'nextSequence', value: state.nextSequence })
      .execute();
    await query
      .insertInto('app_orders_customers')
      .values(
        state.customers.map((customer) => ({
          ...customer,
          createdAt: new Date(customer.createdAt),
        })),
      )
      .execute();
    await query
      .insertInto('app_orders_products')
      .values(
        state.products.map((product) => ({
          ...product,
          createdAt: new Date(product.createdAt),
        })),
      )
      .execute();
    await query
      .insertInto('app_orders_orders')
      .values(
        state.orders.map((order) => {
          const { lines: _lines, ...record } = order;
          return {
            ...record,
            placedAt: new Date(order.placedAt),
            createdAt: new Date(order.createdAt),
            updatedAt: new Date(order.updatedAt),
          };
        }),
      )
      .execute();
    const lines = state.orders.flatMap((order) =>
      order.lines.map((line) => ({ ...line, orderId: order.id })),
    );
    if (lines.length) {
      await query.insertInto('app_orders_order_lines').values(lines).execute();
    }
  },
});

export default seed;
