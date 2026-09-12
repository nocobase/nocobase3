import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202608250002_create_default_pages_permission_set',
  irreversible: true,
  async up({ query }) {
    const now = new Date();
    const pages = await query
      .selectFrom('authorizationPermissionSets')
      .select('key')
      .where('key', '=', 'default-pages')
      .executeTakeFirst();
    if (!pages) {
      await query
        .insertInto('authorizationPermissionSets')
        .values({
          id: crypto.randomUUID(),
          key: 'default-pages',
          title: 'Default pages',
          grants: JSON.stringify([
            {
              resource: { type: 'page', id: 'home' },
              actions: [{ action: 'access' }],
            },
          ]),
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
    const assignmentId = 'authenticated:*:default-pages';
    const assignment = await query
      .selectFrom('authorizationPermissionSetAssignments')
      .select('id')
      .where('id', '=', assignmentId)
      .executeTakeFirst();
    if (!assignment) {
      await query
        .insertInto('authorizationPermissionSetAssignments')
        .values({
          id: assignmentId,
          subjectType: 'authenticated',
          subjectId: '*',
          permissionSetKey: 'default-pages',
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});

export default migration;
