import { encodeAuthorizationTitle } from '@nocobase/authorization/core';
import { defineSeed, type SeedDefinition } from '@nocobase/db';

import {
  SEED_DEPARTMENTS,
  staff,
  STAFF_ASSIGNMENT,
} from '../seed-data/organization.js';

/**
 * The demonstration tree, the staff permission set and its assignment to the root department.
 *
 * Each row is written only when its key is missing, so an administrator's later edits to a department or to the
 * set survive a replay.
 */
const seed: SeedDefinition = defineSeed({
  name: '202609250002_departments_example_seed_organization',
  transaction: true,

  async run({ query }) {
    for (const department of SEED_DEPARTMENTS) {
      const existing = await query
        .selectFrom('departments')
        .select('id')
        .where('id', '=', department.id)
        .executeTakeFirst();
      if (existing) continue;
      await query
        .insertInto('departments')
        .values({ ...department, active: true })
        .execute();
    }

    const now = new Date();
    const set = await query
      .selectFrom('authorizationPermissionSets')
      .select('id')
      .where('key', '=', staff.key)
      .executeTakeFirst();
    if (!set) {
      await query
        .insertInto('authorizationPermissionSets')
        .values({
          id: staff.key,
          key: staff.key,
          title: encodeAuthorizationTitle(staff.title),
          grants: JSON.stringify(staff.grants),
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    const assignment = await query
      .selectFrom('authorizationPermissionSetAssignments')
      .select('id')
      .where('permissionSetKey', '=', STAFF_ASSIGNMENT.permissionSetKey)
      .where('subjectType', '=', STAFF_ASSIGNMENT.subjectType)
      .where('subjectId', '=', STAFF_ASSIGNMENT.subjectId)
      .executeTakeFirst();
    if (!assignment) {
      await query
        .insertInto('authorizationPermissionSetAssignments')
        .values({ ...STAFF_ASSIGNMENT, createdAt: now, updatedAt: now })
        .execute();
    }
  },
});

export default seed;
