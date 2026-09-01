import { defineMigration, type MigrationDefinition } from '@nocobase/db';

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
    await builder.createCollection(
      'authorizationDefaultAccessRuleRecords',
      (collection) => {
        collection.string('id', { length: 64 }).notNull();
        collection.string('defaultAccessRuleId', { length: 64 }).notNull();
        collection.string('action', { length: 255 }).notNull();
        collection.string('recordId', { length: 255 }).notNull();
        collection.datetime('createdAt').notNull();
        collection.primary('id', { name: 'pk_authz_default_access_records' });
        collection.unique(['defaultAccessRuleId', 'action', 'recordId'], {
          name: 'uq_authz_default_records_rule_action_record',
        });
        collection.index('defaultAccessRuleId', {
          name: 'idx_authz_default_records_rule',
        });
      },
    );
  },
  async down({ builder }) {
    await builder.dropCollection('authorizationDefaultAccessRuleRecords');
    await builder.dropCollection('authorizationDefaultAccessRules');
  },
});

export default migration;
