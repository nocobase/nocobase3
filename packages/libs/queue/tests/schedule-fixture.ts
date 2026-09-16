import type { DatabaseConnection, NamingOptions } from '@nocobase/db';

export async function createSchedules(
  connection: DatabaseConnection,
  naming?: NamingOptions,
  name = 'queueSchedules',
): Promise<void> {
  await connection.builder.createCollection(name, (collection) => {
    if (naming) collection.naming(naming);
    collection.string('id').primary().notNull();
    collection.string('status').notNull().defaultTo('active');
    collection.string('name').notNull();
    collection.text('payload').notNull();
    collection.string('cronExpression');
    collection.bigInt('everyMs');
    collection.string('timezone').notNull().defaultTo('UTC');
    collection.double('fromDate');
    collection.double('toDate');
    collection.double('nextRunAt');
    collection.double('lastRunAt');
    collection.double('createdAt').notNull();
    collection.integer('runLimit');
    collection.integer('runCount').notNull().defaultTo(0);
    collection.index(['status', 'nextRunAt']);
  });
}
