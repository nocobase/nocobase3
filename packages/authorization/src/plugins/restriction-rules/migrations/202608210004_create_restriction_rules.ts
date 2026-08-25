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
    await builder.createCollection(
      'authorizationRestrictionRuleRecords',
      (collection) => {
        collection.string('id', { length: 64 }).notNull();
        collection.string('restrictionRuleId', { length: 64 }).notNull();
        collection.string('action', { length: 255 }).notNull();
        collection.string('recordId', { length: 255 }).notNull();
        collection.datetime('createdAt').notNull();
        collection.primary('id', { name: 'pk_authz_restriction_records' });
        collection.unique(['restrictionRuleId', 'action', 'recordId'], {
          name: 'uq_authz_restrict_records_rule_action_record',
        });
        collection.index('restrictionRuleId', {
          name: 'idx_authz_restrict_records_rule',
        });
      },
    );
    await builder.createCollection(
      'authorizationRestrictionRuleAssignments',
      (collection) => {
        collection.string('id', { length: 64 }).notNull();
        collection.string('restrictionRuleId', { length: 64 }).notNull();
        collection.string('subjectType', { length: 255 }).notNull();
        collection.string('subjectId', { length: 255 }).notNull();
        collection.datetime('createdAt').notNull();
        collection.primary('id', { name: 'pk_authz_restrict_assignments' });
        collection.unique(['restrictionRuleId', 'subjectType', 'subjectId'], {
          name: 'uq_authz_restrict_assignments_subject',
        });
        collection.index('restrictionRuleId', {
          name: 'idx_authz_restrict_assignments_rule',
        });
      },
    );
  },
  async down({ builder }) {
    await builder.dropCollection('authorizationRestrictionRuleAssignments');
    await builder.dropCollection('authorizationRestrictionRuleRecords');
    await builder.dropCollection('authorizationRestrictionRules');
  },
});

export default migration;
