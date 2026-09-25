import { randomUUID } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import { defineSeed, type SeedDefinition } from '@nocobase/db';
import { MEMBERS, PROJECTS, QUOTES, ORDERS } from '../../catalog.js';
import type { SalesSeedContext } from '../seed-data/context.js';
import { userProfiles, userRows, type UserKey } from '../seed-data/users.js';
import { accountRows } from '../seed-data/accounts.js';
import { salesMemberRows } from '../seed-data/sales-members.js';
import { carriers } from '../seed-data/carriers.js';
import { permissionSetRows } from '../seed-data/permission-sets.js';
import { permissionSetAssignmentRows } from '../seed-data/permission-set-assignments.js';
import { defaultAccessRuleRows } from '../seed-data/default-access-rules.js';
import { sharingRuleRows } from '../seed-data/sharing-rules.js';
import { sharingRuleAssignmentRows } from '../seed-data/sharing-rule-assignments.js';
import { restrictionRuleRows } from '../seed-data/restriction-rules.js';
import { restrictionRuleAssignmentRows } from '../seed-data/restriction-rule-assignments.js';
import { salesRecords } from '../../server/sales-records.js';

const seed: SeedDefinition = defineSeed({
  name: '202609220002_sales_permissions',
  transaction: true,
  async run(task) {
    const { query } = task;
    if (await query.selectFrom(MEMBERS).select('id').executeTakeFirst()) return;
    // Rule plugins are optional: a missing Collection is reported before any SQL runs, so the probe is safe here.
    const installed = async (collection: string): Promise<boolean> => {
      try {
        await task.repository(collection).exists();
        return true;
      } catch (error) {
        if (
          error instanceof Error &&
          Reflect.get(error, 'code') === 'COLLECTION_NOT_FOUND'
        )
          return false;
        throw error;
      }
    };
    const context: SalesSeedContext = {
      users: Object.fromEntries(
        Object.keys(userProfiles).map((key) => [key, randomUUID()]),
      ) as Record<UserKey, string>,
      now: new Date(),
      password: await hashPassword('AuthzExample123!'),
    };
    await query.insertInto('user').values(userRows(context)).execute();
    await query.insertInto('account').values(accountRows(context)).execute();
    await query.insertInto(MEMBERS).values(salesMemberRows(context)).execute();
    await query
      .insertInto('authorizationExampleCarriers')
      .values(carriers)
      .execute();

    await query
      .insertInto('authorizationPermissionSets')
      .values(permissionSetRows(context))
      .execute();
    await query
      .insertInto('authorizationPermissionSetAssignments')
      .values(permissionSetAssignmentRows(context))
      .execute();
    if (await installed('authorizationDefaultAccessRules'))
      await query
        .insertInto('authorizationDefaultAccessRules')
        .values(defaultAccessRuleRows(context))
        .execute();
    if (await installed('authorizationSharingRules')) {
      await query
        .insertInto('authorizationSharingRules')
        .values(sharingRuleRows(context))
        .execute();
      await query
        .insertInto('authorizationSharingRuleAssignments')
        .values(sharingRuleAssignmentRows(context))
        .execute();
    }
    if (await installed('authorizationRestrictionRules')) {
      await query
        .insertInto('authorizationRestrictionRules')
        .values(restrictionRuleRows(context))
        .execute();
      await query
        .insertInto('authorizationRestrictionRuleAssignments')
        .values(restrictionRuleAssignmentRows(context))
        .execute();
    }

    const records = salesRecords(context.users);
    await query.insertInto(PROJECTS).values(records.projects).execute();
    await query.insertInto(QUOTES).values(records.quotes).execute();
    await query.insertInto(ORDERS).values(records.orders).execute();
  },
});
export default seed;
