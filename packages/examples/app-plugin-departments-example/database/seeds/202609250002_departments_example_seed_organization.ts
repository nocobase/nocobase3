import { randomUUID } from 'node:crypto';

import { encodeAuthorizationTitle } from '@nocobase/authorization/core';
import { defineSeed, type SeedDefinition } from '@nocobase/db';
import { hashPassword } from 'better-auth/crypto';

import {
  DEMO_ACCOUNTS,
  DEMO_PASSWORD,
  DEPARTMENT_ASSIGNMENTS,
  RESTRICTION_ASSIGNMENTS,
  SEED_DEPARTMENTS,
  SEED_PERMISSION_SETS,
  SEED_SHARING_RULES,
  SHARING_ASSIGNMENTS,
  STAFF_MEMBERSHIPS,
  seedRegionOf,
  type SeedAssignment,
  type SeedRuleAssignment,
} from '../seed-data/organization.js';

const DEPARTMENT_SUBJECT = 'org.department';
const SALES_MEMBERS = 'authorizationExampleSalesMembers';

/**
 * The example trading company on top of the authorization example's sales and delivery domain: its department
 * tree, the demo accounts with their memberships, the authorization example's permission sets and rules assigned
 * to departments and people, and each regional account's sales-member row, as an HR sync would write it.
 *
 * Each row is written only when its key is missing, so an administrator's later edits survive a replay. Accounts
 * are keyed by email and written straight into the authentication plugin's `user` and `account` tables; an account
 * that already exists is left alone, memberships, assignments and region included. An assignment whose permission
 * set or rule is missing is skipped rather than written dangling.
 *
 * Sharing and restriction rules belong to optional plugins. When a rule plugin is not installed its collections do
 * not exist, and everything that would write to them is skipped; the rest works with permission sets alone.
 */
const seed: SeedDefinition = defineSeed({
  name: '202609250002_departments_example_seed_organization',
  transaction: true,

  async run(context) {
    const { query } = context;
    const now = new Date();

    // A missing Collection is reported before any SQL runs, so probing leaves the transaction usable.
    async function installed(collection: string): Promise<boolean> {
      try {
        await context.repository(collection).exists();
        return true;
      } catch (error) {
        if (
          error instanceof Error &&
          Reflect.get(error, 'code') === 'COLLECTION_NOT_FOUND'
        )
          return false;
        throw error;
      }
    }

    async function assign(assignment: SeedAssignment): Promise<void> {
      const set = await query
        .selectFrom('authorizationPermissionSets')
        .select('id')
        .where('key', '=', assignment.permissionSetKey)
        .executeTakeFirst();
      if (!set) return;
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

    async function assignRule(
      table: string,
      rules: string,
      column: string,
      assignment: SeedRuleAssignment,
    ): Promise<void> {
      const rule = await query
        .selectFrom(rules)
        .select('id')
        .where('key', '=', assignment.ruleId)
        .executeTakeFirst();
      if (!rule) return;
      const existing = await query
        .selectFrom(table)
        .select('id')
        .where(column, '=', assignment.ruleId)
        .where('subjectType', '=', DEPARTMENT_SUBJECT)
        .where('subjectId', '=', assignment.subjectId)
        .executeTakeFirst();
      if (existing) return;
      await query
        .insertInto(table)
        .values({
          id: assignment.id,
          [column]: assignment.ruleId,
          subjectType: DEPARTMENT_SUBJECT,
          subjectId: assignment.subjectId,
          createdAt: now,
        })
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
        .values({
          ...department,
          title: encodeAuthorizationTitle(department.title),
          active: true,
        })
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
          title:
            set.title === undefined
              ? null
              : encodeAuthorizationTitle(set.title),
          grants: JSON.stringify(set.grants),
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    for (const assignment of DEPARTMENT_ASSIGNMENTS) await assign(assignment);

    if (await installed('authorizationSharingRules')) {
      for (const rule of SEED_SHARING_RULES) {
        const existing = await query
          .selectFrom('authorizationSharingRules')
          .select('id')
          .where('key', '=', rule.key)
          .executeTakeFirst();
        if (existing) continue;
        await query
          .insertInto('authorizationSharingRules')
          .values({
            id: rule.key,
            key: rule.key,
            title:
              rule.title === undefined
                ? null
                : encodeAuthorizationTitle(rule.title),
            resourceType: rule.resource.type,
            resourceId: rule.resource.id,
            actions: JSON.stringify(rule.actions),
            reason: rule.reason ?? null,
            createdAt: now,
            updatedAt: now,
          })
          .execute();
      }
      for (const assignment of SHARING_ASSIGNMENTS)
        await assignRule(
          'authorizationSharingRuleAssignments',
          'authorizationSharingRules',
          'sharingRuleId',
          assignment,
        );
    }
    if (await installed('authorizationRestrictionRules'))
      for (const assignment of RESTRICTION_ASSIGNMENTS)
        await assignRule(
          'authorizationRestrictionRuleAssignments',
          'authorizationRestrictionRules',
          'restrictionRuleId',
          assignment,
        );

    // The authorization example's salespeople join the sales departments once; a removed membership stays removed.
    for (const staff of STAFF_MEMBERSHIPS) {
      const user = await query
        .selectFrom('user')
        .select('id')
        .where('email', '=', staff.email)
        .executeTakeFirst();
      if (!user) continue;
      const userId = String(user.id);
      const existing = await query
        .selectFrom('departmentMembers')
        .select('id')
        .where('userId', '=', userId)
        .executeTakeFirst();
      if (existing) continue;
      await query
        .insertInto('departmentMembers')
        .values({
          id: randomUUID(),
          departmentId: staff.departmentId,
          userId,
          primary: true,
          active: true,
        })
        .execute();
    }

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
      // Appoint the head only where nobody holds the post yet.
      for (const departmentId of account.heads ?? [])
        await query
          .updateTable('departments')
          .set({ managerId: userId })
          .where('id', '=', departmentId)
          .where('managerId', 'is', null)
          .execute();
      for (const key of account.permissionSets ?? [])
        await assign({
          id: randomUUID(),
          permissionSetKey: key,
          subjectType: 'user',
          subjectId: userId,
        });
      // The HR sync: the department's region becomes the account's sales region.
      const region = seedRegionOf(account);
      if (region !== null)
        await query
          .insertInto(SALES_MEMBERS)
          .values({ id: userId, region })
          .execute();
    }
  },
});

export default seed;
