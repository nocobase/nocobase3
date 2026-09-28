// @vitest-environment node
import { selection } from '@nocobase/authorization/core';
import type { SharingRulesAuthorizationApi } from '@nocobase/authorization/sharing-rules';
import type { DatabaseConnection } from '@nocobase/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createTestApp,
  createTree,
  readSales,
  SALES_SETS,
  type TestApp,
} from './helpers.js';

describe('a sharing rule whose subject is a department', () => {
  let test: TestApp;

  beforeAll(async () => {
    test = await createTestApp();
  }, 60_000);

  afterAll(async () => {
    await test.close();
  });

  it("reaches the department's members and stops when they leave", async () => {
    const { authz, organization } = test;
    if (!('sharingRules' in authz))
      throw new Error('Sharing rules is not configured');
    const rules = (
      authz as typeof authz & SharingRulesAuthorizationApi<DatabaseConnection>
    ).sharingRules;

    await createTree(organization, [['share-north', null]]);
    // Both hold the assistant set directly, which views only the projects they own: none. Sharing never grants
    // the action itself.
    const member = await test.signUp('shareMember');
    const outsider = await test.signUp('shareOutsider');
    for (const user of [member, outsider])
      await authz.permissionSets.assign({
        permissionSet: SALES_SETS.assistant,
        subject: { type: 'user', id: user.id },
      });
    await organization.addMember({
      departmentId: 'share-north',
      userId: member.id,
    });

    await rules.create({
      key: 'share-north-hill',
      resource: { type: 'composite', id: 'example.sales.projects' },
      actions: [
        {
          action: 'view',
          scopeKey: 'projects',
          selection: selection.records(['project-3']),
        },
      ],
      subjects: [{ type: 'org.department', id: 'share-north' }],
    });

    expect(await readSales(test, member.cookie)).toEqual({
      status: 200,
      ids: ['project-3'],
    });
    expect(await readSales(test, outsider.cookie)).toEqual({
      status: 200,
      ids: [],
    });

    await organization.removeMember('share-north', member.id);
    expect(await readSales(test, member.cookie)).toEqual({
      status: 200,
      ids: [],
    });

    // A member who never held the action gains nothing from the rule.
    const withoutAction = await test.signUp('shareNoAction');
    await organization.addMember({
      departmentId: 'share-north',
      userId: withoutAction.id,
    });
    expect((await readSales(test, withoutAction.cookie)).status).toBe(403);
  });
});
