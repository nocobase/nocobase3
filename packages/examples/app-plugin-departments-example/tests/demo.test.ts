// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DEMO_PASSWORD } from '../database/seed-data/organization.js';
import { createTestApp, readDirectory, type TestApp } from './helpers.js';

const email = (name: string): string => `${name}@departments.example`;

/** Whether the session may read the organisation settings. */
async function settingsStatus(test: TestApp, cookie: string): Promise<number> {
  const response = await test.request(
    'GET',
    '/api/departments-example/departments',
    { cookie },
  );
  return response.status;
}

describe('the seeded demo accounts', () => {
  let test: TestApp;
  const cookies: Record<string, string> = {};

  beforeAll(async () => {
    test = await createTestApp();
    for (const name of ['dana', 'sam', 'sue', 'li'])
      cookies[name] = await test.signIn(email(name), DEMO_PASSWORD);
  }, 60_000);

  afterAll(async () => {
    await test.close();
  });

  it('see what their departments and direct assignments allow', async () => {
    // Dana is in Headquarters: the staff set there, and only her own department.
    expect(await readDirectory(test, cookies.dana)).toEqual({
      status: 200,
      ids: ['hq'],
    });
    expect(await settingsStatus(test, cookies.dana)).toBe(403);

    // Sam is in East sales: staff from Headquarters and the viewer set from Sales, two levels up and one; the
    // whole directory comes from his direct set.
    expect(await readDirectory(test, cookies.sam)).toEqual({
      status: 200,
      ids: ['hq', 'sales', 'sales-east', 'support'],
    });
    expect(await settingsStatus(test, cookies.sam)).toBe(200);

    // Sue is in Support: staff from Headquarters only; the Sales grant does not reach her.
    expect(await readDirectory(test, cookies.sue)).toEqual({
      status: 200,
      ids: ['hq', 'support'],
    });
    expect(await settingsStatus(test, cookies.sue)).toBe(403);

    // Li is in Sales and Support: both memberships add their departments, and Sales adds the viewer set.
    expect(await readDirectory(test, cookies.li)).toEqual({
      status: 200,
      ids: ['hq', 'sales', 'support'],
    });
    expect(await settingsStatus(test, cookies.li)).toBe(200);
  });

  it('keep a direct assignment when the department grant is revoked', async () => {
    const staff = await test.database
      .connection()
      .query.selectFrom('authorizationPermissionSetAssignments')
      .select('id')
      .where('permissionSetKey', '=', 'departments-example-staff')
      .where('subjectId', '=', 'hq')
      .executeTakeFirstOrThrow();
    await test.authz.permissionSets.revoke(staff.id);

    for (const name of ['dana', 'sue', 'li'])
      expect((await readDirectory(test, cookies[name])).status).toBe(403);
    expect(await readDirectory(test, cookies.sam)).toEqual({
      status: 200,
      ids: ['hq', 'sales', 'sales-east', 'support'],
    });
    // The Sales grant is independent of the one revoked.
    expect(await settingsStatus(test, cookies.li)).toBe(200);
  });
});
