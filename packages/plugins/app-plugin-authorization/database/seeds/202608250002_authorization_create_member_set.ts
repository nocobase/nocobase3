import { defineSeed, type SeedDefinition } from '@nocobase/db';

const MEMBER = 'member';

const seed: SeedDefinition = defineSeed({
  name: '202608250002_authorization_create_member_set',

  async run({ query }) {
    const now = new Date();
    const existingSet = await query
      .selectFrom('authorizationPermissionSets')
      .select('key')
      .where('key', '=', MEMBER)
      .executeTakeFirst();
    if (!existingSet) {
      await query
        .insertInto('authorizationPermissionSets')
        .values({
          id: crypto.randomUUID(),
          key: MEMBER,
          title: JSON.stringify({
            key: 'permissionSets.builtIn.member',
            ns: '@nocobase/app-plugin-authorization',
          }),
          // No grants. The pages every signed-in user must reach declare `access: false` on the route itself, so the
          // member set carries nothing an administrator could delete and nothing a route rename could invalidate.
          grants: JSON.stringify([]),
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    const assignmentId = `authenticated:*:${MEMBER}`;
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
          permissionSetKey: MEMBER,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});

export default seed;
