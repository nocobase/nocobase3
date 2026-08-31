import { defineSeed, type SeedDefinition } from '@nocobase/db';

const SYSTEM_ADMINISTRATOR = 'system-administrator';

const seed: SeedDefinition = defineSeed({
  name: '202608240001_authorization_create_system_administrator',

  async run({ query }) {
    const user = await query
      .selectFrom('user')
      .select('id')
      .where('username', '=', 'nocobase')
      .limit(1)
      .executeTakeFirst();
    if (!user) return;

    const now = new Date();
    const existingSet = await query
      .selectFrom('authorizationPermissionSets')
      .select('key')
      .where('key', '=', SYSTEM_ADMINISTRATOR)
      .executeTakeFirst();
    if (!existingSet) {
      await query
        .insertInto('authorizationPermissionSets')
        .values({
          id: crypto.randomUUID(),
          key: SYSTEM_ADMINISTRATOR,
          title: 'System administrator',
          grants: JSON.stringify(systemAdministratorGrants()),
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    const userId = String(user.id);
    const assignmentId = `user:${userId}:${SYSTEM_ADMINISTRATOR}`;
    const existingAssignment = await query
      .selectFrom('authorizationPermissionSetAssignments')
      .select('id')
      .where('id', '=', assignmentId)
      .executeTakeFirst();
    if (!existingAssignment) {
      await query
        .insertInto('authorizationPermissionSetAssignments')
        .values({
          id: assignmentId,
          subjectType: 'user',
          subjectId: userId,
          permissionSetKey: SYSTEM_ADMINISTRATOR,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});

function systemAdministratorGrants(): readonly object[] {
  const settings = administratorResources.map(({ id, actions }) => ({
    resource: { type: 'authorization.settings', id },
    actions: actions.map((action) => ({ action })),
  }));
  return [
    ...settings,
    {
      resource: { type: 'page', id: '*' },
      actions: [{ action: 'access' }],
    },
  ];
}

const administratorResources = [
  { id: 'permission-sets', actions: ['read', 'create', 'update', 'delete'] },
  { id: 'default-access', actions: ['read', 'create', 'update', 'delete'] },
  { id: 'sharing-rules', actions: ['read', 'create', 'update', 'delete'] },
  { id: 'restriction-rules', actions: ['read', 'create', 'update', 'delete'] },
] as const;

export default seed;
