// @vitest-environment node
import { selection } from '@nocobase/authorization/core';
import {
  defineSharingRule,
  type SharingRulesAuthorizationApi,
} from '@nocobase/authorization/sharing-rules';
import type { DatabaseConnection } from '@nocobase/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { directory } from '../server/index.js';
import {
  createTestApp,
  createTree,
  directorySet,
  readDirectory,
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

    await createTree(organization, [
      ['north', null],
      ['south', null],
    ]);
    // Everyone holds `view` directly, scoped to their own departments; sharing never grants the action itself.
    const set = directorySet('sharing-viewers');
    await authz.permissionSets.create(set);
    const member = await test.signUp('northMember');
    const outsider = await test.signUp('northOutsider');
    for (const user of [member, outsider])
      await authz.permissionSets.assign({
        permissionSet: set.key,
        subject: { type: 'user', id: user.id },
      });
    await organization.addMember({ departmentId: 'north', userId: member.id });

    await rules.create(
      defineSharingRule('north-sees-south', directory.reference())
        .title('North sees South')
        .subjects({ type: 'org.department', id: 'north' })
        .scope('view', 'departments', selection.records(['south']))
        .build(),
    );

    expect(await readDirectory(test, member.cookie)).toEqual({
      status: 200,
      ids: ['north', 'south'],
    });
    expect(await readDirectory(test, outsider.cookie)).toEqual({
      status: 200,
      ids: [],
    });

    await organization.removeMember('north', member.id);
    expect(await readDirectory(test, member.cookie)).toEqual({
      status: 200,
      ids: [],
    });

    // A user who never held the action gains nothing from the rule.
    const withoutAction = await test.signUp('northNoAction');
    await organization.addMember({
      departmentId: 'north',
      userId: withoutAction.id,
    });
    expect((await readDirectory(test, withoutAction.cookie)).status).toBe(403);
  });
});
