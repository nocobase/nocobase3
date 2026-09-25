// @vitest-environment node
import { selection } from '@nocobase/authorization/core';
import { definePermissionSet } from '@nocobase/authorization/permission-sets';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DEMO_PASSWORD } from '../database/seed-data/organization.js';
import {
  DEPARTMENT_HEAD_SUBJECT,
  DEPARTMENT_SUBJECT,
  SCOPE_MY_DEPARTMENTS_AND_BELOW,
} from '../server/index.js';
import { createTestApp, readSales, type TestApp } from './helpers.js';

const email = (name: string): string => `${name}@departments.example`;

/**
 * Default access, sharing rules and restriction rules are optional plugins. With only the authorization plugin the
 * example installs, seeds what permission sets alone express, and its subjects and scopes work unchanged.
 */
describe('with the authorization plugin alone', () => {
  let test: TestApp;

  beforeAll(async () => {
    test = await createTestApp({ rules: false });
  }, 60_000);

  afterAll(async () => {
    await test.close();
  });

  it('runs the migrations and seeds without the rule plugins', async () => {
    const query = test.database.connection().query;
    const departments = await query
      .selectFrom('departments')
      .select(['id', 'managerId'])
      .execute();
    expect(departments.map((row) => row.id)).toContain('sales-center');
    expect(
      departments.find((row) => row.id === 'north-sales')?.managerId,
    ).toBeTruthy();
    expect(
      await test.database
        .connection()
        .collections.get('authorizationSharingRules'),
    ).toBeUndefined();
    const assignments = await query
      .selectFrom('authorizationPermissionSetAssignments')
      .select(['permissionSetKey', 'subjectType'])
      .where('subjectType', 'in', [DEPARTMENT_SUBJECT, DEPARTMENT_HEAD_SUBJECT])
      .execute();
    expect(assignments).toContainEqual({
      permissionSetKey: 'departments-example-head',
      subjectType: DEPARTMENT_HEAD_SUBJECT,
    });
    expect(
      test.authz.recordAccess.get(SCOPE_MY_DEPARTMENTS_AND_BELOW),
    ).toBeDefined();
  });

  it('resolves department and head subjects and scopes records by department', async () => {
    const sophia = await test.signIn(email('sophia'), DEMO_PASSWORD);
    const owen = await test.signIn(email('owen'), DEMO_PASSWORD);
    const nina = await test.signIn(email('nina'), DEMO_PASSWORD);
    // The department scopes select the demo projects of this example's staff, none of them confidential.
    expect(await readSales(test, sophia)).toEqual({
      status: 200,
      ids: [
        'dept-project-bayview',
        'dept-project-northgate',
        'dept-project-riverside',
        'dept-project-southport',
      ],
    });
    expect(await readSales(test, owen)).toEqual({
      status: 200,
      ids: ['dept-project-northgate', 'dept-project-riverside'],
    });
    expect(await readSales(test, owen, 'orders')).toMatchObject({
      status: 200,
    });
    // North Sales colleagues through the department project viewer set.
    expect((await readSales(test, nina)).ids).toEqual(
      expect.arrayContaining([
        'dept-project-northgate',
        'dept-project-riverside',
      ]),
    );
  });

  it('gives Delivery nothing it would have received from the missing sharing rule', async () => {
    // Delivery's own-projects set opens the page and reaches no project: its members own none.
    for (const name of ['mia', 'chen']) {
      const cookie = await test.signIn(email(name), DEMO_PASSWORD);
      expect({ name, ...(await readSales(test, cookie)) }).toEqual({
        name,
        status: 200,
        ids: [],
      });
    }
  });

  it('can hand specific records to a department only with a set that grants the action on them', async () => {
    // The permission-set alternative to the sharing rule: the action and the records in one grant.
    const set = definePermissionSet('delivery-selected-projects')
      .grant({
        resource: { type: 'composite', id: 'example.sales.projects' },
        actions: [
          {
            action: 'view',
            policy: {
              type: 'composite',
              scopes: { projects: selection.records(['dept-project-bayview']) },
            },
          },
        ],
      })
      .build();
    await test.authz.permissionSets.create(set);
    const assignment = await test.authz.permissionSets.assign({
      permissionSet: set.key,
      subject: { type: DEPARTMENT_SUBJECT, id: 'delivery' },
    });
    const mia = await test.signIn(email('mia'), DEMO_PASSWORD);
    try {
      expect(await readSales(test, mia)).toEqual({
        status: 200,
        ids: ['dept-project-bayview'],
      });
    } finally {
      await test.authz.permissionSets.revoke(assignment.id);
    }
    expect(await readSales(test, mia)).toEqual({ status: 200, ids: [] });
  });
});
