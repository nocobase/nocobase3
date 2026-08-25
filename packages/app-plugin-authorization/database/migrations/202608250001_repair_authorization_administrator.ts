import { defineMigration, type MigrationDefinition } from '@nocobase/database';

const migration: MigrationDefinition = defineMigration({
  name: '202608250001_repair_authorization_administrator',
  irreversible: true,
  async up({ query }) {
    const now = new Date();
    const user = await query
      .selectFrom('user')
      .select('id')
      .where('username', '=', 'nocobase')
      .executeTakeFirst();
    if (!user) return;
    const grants: readonly AdministratorGrant[] = [
      ...administratorResources.map(({ id, actions }) => ({
        resource: { type: 'authorization.settings', id },
        actions: actions.map((action) => ({ action })),
      })),
      {
        resource: { type: 'page', id: '*' },
        actions: [{ action: 'access' }],
      },
    ];
    const existing = await query
      .selectFrom('authorizationPermissionSets')
      .select('key')
      .where('key', '=', 'system-administrator')
      .executeTakeFirst();
    if (existing) {
      await query
        .updateTable('authorizationPermissionSets')
        .set({ grants: JSON.stringify(grants), updatedAt: now })
        .where('key', '=', 'system-administrator')
        .execute();
    } else {
      await query
        .insertInto('authorizationPermissionSets')
        .values({
          id: crypto.randomUUID(),
          key: 'system-administrator',
          title: 'System administrator',
          grants: JSON.stringify(grants),
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
    const assignmentId = `user:${String(user.id)}:system-administrator`;
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
          subjectType: 'user',
          subjectId: String(user.id),
          permissionSetKey: 'system-administrator',
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});

const administratorResources = [
  { id: 'permission-sets', actions: ['read', 'create', 'update', 'delete'] },
  { id: 'default-access', actions: ['read', 'create', 'update', 'delete'] },
  { id: 'sharing-rules', actions: ['read', 'create', 'update', 'delete'] },
  { id: 'restriction-rules', actions: ['read', 'create', 'update', 'delete'] },
] as const;

interface AdministratorGrant {
  resource: { type: string; id: string };
  actions: readonly { action: string }[];
}

export default migration;
