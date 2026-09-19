import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609190001_audit_example_create_customers',
  async up({ builder }) {
    await builder.createCollection('auditExampleCustomers', (collection) => {
      collection.string('id', { length: 64 }).primary().notNull();
      collection.string('ownerId', { length: 64 }).notNull();
      collection.string('name', { length: 120 }).notNull();
      collection.string('phone', { length: 32 }).notNull();
      collection.integer('version').notNull();
      collection.optimisticLock('version');
      collection.index(['ownerId']);
    });
    await builder.createCollection('auditExampleOperations', (collection) => {
      collection.string('id', { length: 64 }).primary().notNull();
      collection.integer('schemaVersion').notNull();
      collection.string('appName', { length: 128 }).notNull();
      collection.datetimeTz('occurredAt').notNull();
      collection.string('ownerId', { length: 64 }).notNull();
      collection.json('actor').notNull();
      collection.json('source').notNull();
      collection.json('initiator');
      collection.string('operationId', { length: 128 });
      collection.string('tenantId', { length: 128 });
      collection.string('action', { length: 128 }).notNull();
      collection.string('targetType', { length: 128 });
      collection.string('targetId', { length: 64 });
      collection.string('result', { length: 32 }).notNull();
      collection.json('data').notNull();
      collection.index(['ownerId', 'targetId', 'occurredAt', 'id']);
    });
  },
  async down({ builder }) {
    await builder.dropCollection('auditExampleOperations');
    await builder.dropCollection('auditExampleCustomers');
  },
});
export default migration;
