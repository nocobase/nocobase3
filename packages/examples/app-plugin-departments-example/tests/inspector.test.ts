// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  ADMIN,
  createTestApp,
  createTree,
  directorySet,
  type TestApp,
} from './helpers.js';

interface Configured {
  readonly identity: { readonly subjects: { type: string; id: string }[] };
  readonly sets: {
    readonly key: string;
    readonly sources: { type: string; id: string }[];
  }[];
}

describe('the inspector for a department member', () => {
  let test: TestApp;

  beforeAll(async () => {
    test = await createTestApp();
  }, 60_000);

  afterAll(async () => {
    await test.close();
  });

  it('reports the departments as subjects and the parent department as the source of its set', async () => {
    const { authz, organization } = test;
    await createTree(organization, [
      ['in-root', null],
      ['in-leaf', 'in-root'],
    ]);
    const set = directorySet('inspector-set');
    await authz.permissionSets.create(set);
    await authz.permissionSets.assign({
      permissionSet: set.key,
      subject: { type: 'org.department', id: 'in-root' },
    });
    const member = await test.signUp('inspectorMember');
    await organization.addMember({
      departmentId: 'in-leaf',
      userId: member.id,
    });

    const admin = await test.signIn(ADMIN.email, ADMIN.password);
    const response = await test.request(
      'POST',
      '/api/authz/inspector/configured',
      { cookie: admin, json: { subject: { type: 'user', id: member.id } } },
    );
    expect(response.status).toBe(200);
    const { data } = (await response.json()) as { data: Configured };

    expect(data.identity.subjects).toEqual(
      expect.arrayContaining([
        { type: 'org.department', id: 'in-leaf' },
        { type: 'org.department', id: 'in-root' },
      ]),
    );
    expect(data.sets.find((entry) => entry.key === set.key)?.sources).toEqual([
      { type: 'org.department', id: 'in-root' },
    ]);
  });
});
