// @vitest-environment node
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
    // No restriction rule hides the confidential project-4 here: without that plugin, keep it out of the scopes.
    expect(await readSales(test, sophia)).toEqual({
      status: 200,
      ids: ['project-1', 'project-2', 'project-3', 'project-4'],
    });
    expect(await readSales(test, owen)).toEqual({
      status: 200,
      ids: ['project-1', 'project-2', 'project-4'],
    });
    expect(await readSales(test, owen, 'orders')).toMatchObject({
      status: 200,
    });
    // North Sales colleagues through the department project viewer set.
    expect((await readSales(test, nina)).ids).toEqual(
      expect.arrayContaining(['project-1', 'project-2']),
    );
  });

  it('gives Delivery nothing it would have received from the missing sharing rule', async () => {
    const mia = await test.signIn(email('mia'), DEMO_PASSWORD);
    expect(await readSales(test, mia)).toEqual({ status: 200, ids: [] });
  });
});
