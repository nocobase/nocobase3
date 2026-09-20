import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609220003_nullable_order_delivery_reference',
  async up({ builder }) {
    await builder.alterCollection(
      'authorizationExampleOrders',
      (collection) => {
        collection.alterField('deliveryReference', {
          type: 'string',
          length: 255,
          nullable: true,
        });
      },
    );
  },
  async down({ builder, query }) {
    // Do not invent delivery references or discard orders to restore NOT NULL.
    const missingReference = await query
      .selectFrom('authorizationExampleOrders')
      .select('id')
      .where('deliveryReference', 'is', null)
      .executeTakeFirst();
    if (missingReference) {
      throw new Error(
        'Fill missing order delivery references before rolling back.',
      );
    }
    await builder.alterCollection(
      'authorizationExampleOrders',
      (collection) => {
        collection.alterField('deliveryReference', {
          type: 'string',
          length: 255,
          nullable: false,
        });
      },
    );
  },
});

export default migration;
