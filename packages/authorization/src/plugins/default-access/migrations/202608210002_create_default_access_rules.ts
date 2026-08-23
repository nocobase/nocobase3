import { defineMigration, type MigrationDefinition } from '@nocobase/database';

const migration: MigrationDefinition = defineMigration({
  name: '202608210002_create_default_access_rules',
  async up({ builder }) {
    await builder.createCollection(
      'authorizationDefaultAccessRules',
      (collection) => {
        collection.string('id', { length: 64 }).notNull();
        collection.string('resourceType', { length: 255 }).notNull();
        collection.string('resourceId', { length: 255 }).notNull();
        collection.json('actions').notNull();
        collection.json('scope').notNull();
        collection.datetime('createdAt').notNull();
        collection.datetime('updatedAt').notNull();
        collection.primary('id', {
          name: 'pk_authorization_default_access_rules',
        });
        collection.unique(['resourceType', 'resourceId'], {
          name: 'uq_authorization_default_access_resource',
        });
      },
    );
  },
  async down({ builder }) {
    await builder.dropCollection('authorizationDefaultAccessRules');
  },
});

export default migration;
