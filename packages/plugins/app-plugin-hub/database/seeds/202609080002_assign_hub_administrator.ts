import { defineSeed, type SeedDefinition } from '@nocobase/db';

const HUB_ADMINISTRATOR = 'hub-administrator';
const HUB_PERMISSION_SET_KEYS = [
  HUB_ADMINISTRATOR,
  'hub-operator',
  'hub-viewer',
] as const;

const seed: SeedDefinition = defineSeed({
  name: '202609080002_assign_hub_administrator',

  async run({ query }) {
    const permissionSet = await query
      .selectFrom('authorizationPermissionSets')
      .select('key')
      .where('key', '=', HUB_ADMINISTRATOR)
      .executeTakeFirst();
    if (!permissionSet) return;

    const now = new Date();
    const superusers = await query
      .selectFrom('authorizationPermissionSetAssignments')
      .select(['subjectType', 'subjectId'])
      .where('subjectType', '=', 'user')
      .where('permissionSetKey', '=', 'root')
      .execute();
    for (const subject of superusers) {
      const subjectId = String(subject.subjectId);
      await query
        .deleteFrom('authorizationPermissionSetAssignments')
        .where('subjectType', '=', 'user')
        .where('subjectId', '=', subjectId)
        .where('permissionSetKey', 'in', HUB_PERMISSION_SET_KEYS)
        .where('permissionSetKey', '!=', HUB_ADMINISTRATOR)
        .execute();
      const existing = await query
        .selectFrom('authorizationPermissionSetAssignments')
        .select('id')
        .where('subjectType', '=', 'user')
        .where('subjectId', '=', subjectId)
        .where('permissionSetKey', '=', HUB_ADMINISTRATOR)
        .executeTakeFirst();
      if (existing) continue;
      await query
        .insertInto('authorizationPermissionSetAssignments')
        .values({
          id: `user:${subjectId}:${HUB_ADMINISTRATOR}`,
          subjectType: 'user',
          subjectId,
          permissionSetKey: HUB_ADMINISTRATOR,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});

export default seed;
