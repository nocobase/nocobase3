import { defineSeed, type SeedDefinition } from '@nocobase/database';

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
          grants: JSON.stringify([
            {
              resource: {
                type: 'authorization.permission-sets',
                id: '*',
              },
              actions: [
                { action: 'read' },
                { action: 'create' },
                { action: 'update' },
                { action: 'delete' },
              ],
            },
            {
              resource: { type: 'page', id: '*' },
              actions: [{ action: 'access' }],
            },
          ]),
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

export default seed;
