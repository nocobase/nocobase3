import { defineMigration, type MigrationDefinition } from '@nocobase/database';

const migration: MigrationDefinition = defineMigration({
  name: '202608210003_create_sharing_rules',
  async up({ builder }) {
    await builder.createCollection(
      'authorizationSharingRules',
      (collection) => {
        collection.string('id', { length: 64 }).notNull();
        collection.string('key', { length: 255 }).notNull();
        collection.string('title', { length: 255 }).nullable();
        collection.string('resourceType', { length: 255 }).notNull();
        collection.string('resourceId', { length: 255 }).notNull();
        collection.json('actions').notNull();
        collection.json('subjects').notNull();
        collection.string('selectionType', { length: 32 }).notNull();
        collection.json('scope').nullable();
        collection.text('reason').nullable();
        collection.datetime('createdAt').notNull();
        collection.datetime('updatedAt').notNull();
        collection.primary('id', { name: 'pk_authorization_sharing_rules' });
        collection.unique('key', {
          name: 'uq_authorization_sharing_rules_key',
        });
        collection.index(['resourceType', 'resourceId'], {
          name: 'idx_authorization_sharing_rules_resource',
        });
      },
    );
    await builder.createCollection(
      'authorizationSharingRuleRecords',
      (collection) => {
        collection.string('id', { length: 64 }).notNull();
        collection.string('sharingRuleId', { length: 64 }).notNull();
        collection.string('recordId', { length: 255 }).notNull();
        collection.datetime('createdAt').notNull();
        collection.primary('id', {
          name: 'pk_authorization_sharing_rule_records',
        });
        collection.unique(['sharingRuleId', 'recordId'], {
          name: 'uq_authorization_sharing_rule_records_rule_record',
        });
        collection.index('sharingRuleId', {
          name: 'idx_authorization_sharing_rule_records_rule',
        });
      },
    );
  },
  async down({ builder }) {
    await builder.dropCollection('authorizationSharingRuleRecords');
    await builder.dropCollection('authorizationSharingRules');
  },
});

export default migration;
