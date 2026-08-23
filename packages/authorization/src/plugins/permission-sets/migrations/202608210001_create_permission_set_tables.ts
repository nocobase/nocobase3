import { defineMigration, type MigrationDefinition } from '@nocobase/database';

const migration: MigrationDefinition = defineMigration({
  name: '202608210001_create_permission_set_tables',

  async up({ builder }) {
    await builder.createCollection(
      'authorizationPermissionSets',
      (collection) => {
        collection.string('id', { length: 64 }).notNull();
        collection.string('key', { length: 255 }).notNull();
        collection.string('title', { length: 255 }).nullable();
        collection.json('grants').notNull();
        collection.datetime('createdAt').notNull();
        collection.datetime('updatedAt').notNull();

        collection.primary('id', {
          name: 'pk_authorization_permission_sets',
        });
        collection.unique('key', {
          name: 'uq_authorization_permission_sets_key',
        });
      },
    );

    await builder.createCollection(
      'authorizationPermissionSetAssignments',
      (collection) => {
        collection.string('id', { length: 255 }).notNull();
        collection.string('subjectType', { length: 64 }).notNull();
        collection.string('subjectId', { length: 255 }).notNull();
        collection.string('permissionSetKey', { length: 255 }).notNull();
        collection.datetime('createdAt').notNull();
        collection.datetime('updatedAt').notNull();

        collection.primary('id', {
          name: 'pk_authorization_permission_set_assignments',
        });
        collection.unique(['subjectType', 'subjectId', 'permissionSetKey'], {
          name: 'uq_authorization_permission_set_assignments_subject_set',
        });
        collection.index(['subjectType', 'subjectId'], {
          name: 'idx_authorization_permission_set_assignments_subject',
        });
        collection.index('permissionSetKey', {
          name: 'idx_authorization_permission_set_assignments_set',
        });
      },
    );
  },

  async down({ builder }) {
    await builder.dropCollection('authorizationPermissionSetAssignments');
    await builder.dropCollection('authorizationPermissionSets');
  },
});

export default migration;
