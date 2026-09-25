import { randomUUID } from 'node:crypto';

import { encodeAuthorizationTitle } from '@nocobase/authorization/core';
import { defineSeed, type SeedDefinition } from '@nocobase/db';
import { hashPassword } from 'better-auth/crypto';

import {
  DEMO_ACCOUNTS,
  DEMO_PASSWORD,
  DEPARTMENT_ASSIGNMENTS,
  SEED_DEPARTMENTS,
  SEED_PERMISSION_SETS,
  type SeedAssignment,
} from '../seed-data/organization.js';

/**
 * The demonstration tree, its permission sets and their assignments, and the demo accounts with their memberships.
 *
 * Each row is written only when its key is missing, so an administrator's later edits survive a replay. Accounts
 * are keyed by email and written straight into the authentication plugin's `user` and `account` tables; an account
 * that already exists is left alone, memberships and direct assignments included.
 */
const seed: SeedDefinition = defineSeed({
  name: '202609250002_departments_example_seed_organization',
  transaction: true,

  async run({ query }) {
    const now = new Date();

    async function assign(assignment: SeedAssignment): Promise<void> {
      const existing = await query
        .selectFrom('authorizationPermissionSetAssignments')
        .select('id')
        .where('permissionSetKey', '=', assignment.permissionSetKey)
        .where('subjectType', '=', assignment.subjectType)
        .where('subjectId', '=', assignment.subjectId)
        .executeTakeFirst();
      if (existing) return;
      await query
        .insertInto('authorizationPermissionSetAssignments')
        .values({ ...assignment, createdAt: now, updatedAt: now })
        .execute();
    }

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

    for (const set of SEED_PERMISSION_SETS) {
      const existing = await query
        .selectFrom('authorizationPermissionSets')
        .select('id')
        .where('key', '=', set.key)
        .executeTakeFirst();
      if (existing) continue;
      await query
        .insertInto('authorizationPermissionSets')
        .values({
          id: set.key,
          key: set.key,
          title: encodeAuthorizationTitle(set.title),
          grants: JSON.stringify(set.grants),
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    for (const assignment of DEPARTMENT_ASSIGNMENTS) await assign(assignment);

    let password: string | undefined;
    for (const account of DEMO_ACCOUNTS) {
      const existing = await query
        .selectFrom('user')
        .select('id')
        .where('email', '=', account.email)
        .executeTakeFirst();
      if (existing) continue;
      const userId = randomUUID();
      password ??= await hashPassword(DEMO_PASSWORD);
      await query
        .insertInto('user')
        .values({
          id: userId,
          name: account.name,
          email: account.email,
          emailVerified: true,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      await query
        .insertInto('account')
        .values({
          id: randomUUID(),
          accountId: userId,
          providerId: 'credential',
          userId,
          password,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      for (const membership of account.memberships)
        await query
          .insertInto('departmentMembers')
          .values({ id: randomUUID(), userId, ...membership, active: true })
          .execute();
      for (const key of account.permissionSets ?? [])
        await assign({
          id: randomUUID(),
          permissionSetKey: key,
          subjectType: 'user',
          subjectId: userId,
        });
    }
  },
});

export default seed;
