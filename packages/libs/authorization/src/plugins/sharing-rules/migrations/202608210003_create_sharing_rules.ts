import {
  defineMigration,
  type MigrationDefinition,
} from '@nocobase/app-database';

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
        collection.string('action', { length: 255 }).notNull();
        collection.string('recordId', { length: 255 }).notNull();
        collection.datetime('createdAt').notNull();
        collection.primary('id', {
          name: 'pk_authorization_sharing_rule_records',
        });
        collection.unique(['sharingRuleId', 'action', 'recordId'], {
          name: 'uq_authz_sharing_records_rule_action_record',
        });
        collection.index('sharingRuleId', {
          name: 'idx_authorization_sharing_rule_records_rule',
        });
      },
    );
    await builder.createCollection(
      'authorizationSharingRuleAssignments',
      (collection) => {
        collection.string('id', { length: 64 }).notNull();
        collection.string('sharingRuleId', { length: 64 }).notNull();
        collection.string('subjectType', { length: 255 }).notNull();
        collection.string('subjectId', { length: 255 }).notNull();
        collection.datetime('createdAt').notNull();
        collection.primary('id', { name: 'pk_authz_sharing_assignments' });
        collection.unique(['sharingRuleId', 'subjectType', 'subjectId'], {
          name: 'uq_authz_sharing_assignments_subject',
        });
        collection.index('sharingRuleId', {
          name: 'idx_authz_sharing_assignments_rule',
        });
      },
    );
  },
  async down({ builder }) {
    await builder.dropCollection('authorizationSharingRuleAssignments');
    await builder.dropCollection('authorizationSharingRuleRecords');
    await builder.dropCollection('authorizationSharingRules');
  },
});

export default migration;
