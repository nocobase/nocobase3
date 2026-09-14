import { defineSeed, type SeedDefinition } from '@nocobase/db';

const AUTHENTICATED = 'authenticated';

const seed: SeedDefinition = defineSeed({
  name: '202608250002_authorization_create_authenticated_role',

  async run({ query }) {
    const now = new Date();
    const existingSet = await query
      .selectFrom('authorizationPermissionSets')
      .select('key')
      .where('key', '=', AUTHENTICATED)
      .executeTakeFirst();
    if (!existingSet) {
      await query
        .insertInto('authorizationPermissionSets')
        .values({
          id: crypto.randomUUID(),
          key: AUTHENTICATED,
          title: 'All signed-in users',
          // No grants. The pages every signed-in user must reach declare `access: false` on the route itself, so the
          // baseline set carries nothing an administrator could delete and nothing a route rename could invalidate.
          grants: JSON.stringify([]),
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    const assignmentId = `authenticated:*:${AUTHENTICATED}`;
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
          subjectType: 'authenticated',
          subjectId: '*',
          permissionSetKey: AUTHENTICATED,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});

export default seed;
