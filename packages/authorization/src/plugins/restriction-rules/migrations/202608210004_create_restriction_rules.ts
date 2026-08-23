import { defineMigration, type MigrationDefinition } from '@nocobase/database';

const migration: MigrationDefinition = defineMigration({
  name: '202608210004_create_restriction_rules',
  async up({ builder }) {
    await builder.createCollection(
      'authorizationRestrictionRules',
      (collection) => {
        collection.string('id', { length: 64 }).notNull();
        collection.string('key', { length: 255 }).notNull();
        collection.string('title', { length: 255 }).nullable();
        collection.string('resourceType', { length: 255 }).notNull();
        collection.string('resourceId', { length: 255 }).notNull();
        collection.json('actions').notNull();
        collection.json('subjects').notNull();
        collection.json('scope').notNull();
        collection.text('reason').nullable();
        collection.datetime('createdAt').notNull();
        collection.datetime('updatedAt').notNull();
        collection.primary('id', {
          name: 'pk_authorization_restriction_rules',
        });
        collection.unique('key', {
          name: 'uq_authorization_restriction_rules_key',
        });
        collection.index(['resourceType', 'resourceId'], {
          name: 'idx_authorization_restriction_rules_resource',
        });
      },
    );
  },
  async down({ builder }) {
    await builder.dropCollection('authorizationRestrictionRules');
  },
});

export default migration;
