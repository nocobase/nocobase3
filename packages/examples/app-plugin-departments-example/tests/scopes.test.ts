// @vitest-environment node
import { selection } from '@nocobase/authorization/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  SCOPE_MY_DEPARTMENTS,
  SCOPE_MY_DEPARTMENTS_AND_BELOW,
  SCOPE_SELECTED_DEPARTMENT,
} from '../server/index.js';
import {
  createProject,
  createTestApp,
  createTree,
  readSales,
  salesViewSet,
  type SalesList,
  type TestApp,
  type TestUser,
} from './helpers.js';

/**
 * The department data scopes on the sales example's lists. The tree `sc-root > sc-a > sc-a1` and `sc-root > sc-b`
 * has one owner per department, each owning one project with its quote and order; only rows this file writes are
 * compared, and nothing here sits under the seeded company, so its restriction does not apply.
 */
describe('department data scopes', () => {
  let test: TestApp;
  const owners: Record<'a' | 'a1' | 'b', TestUser> = {} as Record<
    'a' | 'a1' | 'b',
    TestUser
  >;

  async function holder(
    name: string,
    scope: Parameters<typeof salesViewSet>[1],
    departments: readonly string[] = [],
  ): Promise<TestUser> {
    const user = await test.signUp(name);
    const set = salesViewSet(`scope-${name}`, scope);
    await test.authz.permissionSets.create(set);
    await test.authz.permissionSets.assign({
      permissionSet: set.key,
      subject: { type: 'user', id: user.id },
    });
    for (const departmentId of departments)
      await test.organization.addMember({ departmentId, userId: user.id });
    return user;
  }

  /** The ids of this file's rows a session reads in one list. */
  async function read(
    user: TestUser,
    list: SalesList = 'projects',
  ): Promise<string[]> {
    const result = await readSales(test, user.cookie, list);
    expect(result.status).toBe(200);
    return result.ids.filter((id) => id.startsWith('sc-'));
  }

  beforeAll(async () => {
    test = await createTestApp();
    await createTree(test.organization, [
      ['sc-root', null],
      ['sc-a', 'sc-root'],
      ['sc-a1', 'sc-a'],
      ['sc-b', 'sc-root'],
    ]);
    for (const key of ['a', 'a1', 'b'] as const) {
      owners[key] = await test.signUp(`scOwner${key}`);
      await test.organization.addMember({
        departmentId: `sc-${key}`,
        userId: owners[key].id,
      });
      await createProject(test, `sc-${key}`, owners[key].id);
    }
  }, 60_000);

  afterAll(async () => {
    await test.close();
  });

  it('My departments reaches the owners of every department a viewer belongs to, and not those below', async () => {
    const viewer = await holder('scMine', SCOPE_MY_DEPARTMENTS, [
      'sc-a',
      'sc-b',
    ]);
    expect(await read(viewer)).toEqual(['sc-a', 'sc-b']);
    expect(await read(viewer, 'quotes')).toEqual(['sc-a-quote', 'sc-b-quote']);
    // Orders have no owner; they follow their project's.
    expect(await read(viewer, 'orders')).toEqual(['sc-a-order', 'sc-b-order']);

    // Someone outside every department holds the set and reads nothing.
    expect(
      await read(await holder('scMineAlone', SCOPE_MY_DEPARTMENTS)),
    ).toEqual([]);
  });

  it('My departments and below adds every active department under them', async () => {
    const viewer = await holder('scBelow', SCOPE_MY_DEPARTMENTS_AND_BELOW, [
      'sc-a',
    ]);
    expect(await read(viewer)).toEqual(['sc-a', 'sc-a1']);
    expect(await read(viewer, 'orders')).toEqual(['sc-a-order', 'sc-a1-order']);

    // A disabled child drops out; enabling it brings it back.
    await test.organization.setActive('sc-a1', false);
    try {
      expect(await read(viewer)).toEqual(['sc-a']);
    } finally {
      await test.organization.setActive('sc-a1', true);
    }
    expect(await read(viewer)).toEqual(['sc-a', 'sc-a1']);
  });

  it('ignores removed members and departments under a disabled ancestor', async () => {
    const viewer = await holder('scInactive', SCOPE_MY_DEPARTMENTS_AND_BELOW, [
      'sc-root',
    ]);
    expect(await read(viewer)).toEqual(['sc-a', 'sc-a1', 'sc-b']);

    // An owner who left no longer brings their records.
    await test.organization.removeMember('sc-b', owners.b.id);
    try {
      expect(await read(viewer)).toEqual(['sc-a', 'sc-a1']);
    } finally {
      await test.organization.addMember({
        departmentId: 'sc-b',
        userId: owners.b.id,
      });
    }

    // Disabling an ancestor ends the viewer's own department and everything below it.
    await test.organization.setActive('sc-root', false);
    try {
      expect(await read(viewer)).toEqual([]);
    } finally {
      await test.organization.setActive('sc-root', true);
    }
  });

  it('Selected department reads its params, with and without descendants', async () => {
    const only = await holder(
      'scSelected',
      selection.recordAccess(SCOPE_SELECTED_DEPARTMENT, {
        departmentId: 'sc-a',
        includeDescendants: false,
      }) as { type: 'recordAccess'; key: string; params?: unknown },
    );
    expect(await read(only)).toEqual(['sc-a']);

    const below = await holder(
      'scSelectedBelow',
      selection.recordAccess(SCOPE_SELECTED_DEPARTMENT, {
        departmentId: 'sc-a',
        includeDescendants: true,
      }) as { type: 'recordAccess'; key: string; params?: unknown },
    );
    expect(await read(below)).toEqual(['sc-a', 'sc-a1']);
    expect(await read(below, 'quotes')).toEqual(['sc-a-quote', 'sc-a1-quote']);

    // The chosen department disabled selects nothing.
    await test.organization.setActive('sc-a', false);
    try {
      expect(await read(below)).toEqual([]);
    } finally {
      await test.organization.setActive('sc-a', true);
    }
  });

  it('Selected department selects nothing without valid params', async () => {
    for (const [name, params] of [
      ['scNoParams', undefined],
      ['scBadId', { departmentId: 7 }],
      ['scBadFlag', { departmentId: 'sc-a', includeDescendants: 'yes' }],
      ['scMissing', { departmentId: 'sc-nowhere' }],
    ] as const) {
      const user = await holder(name, {
        type: 'recordAccess',
        key: SCOPE_SELECTED_DEPARTMENT,
        ...(params === undefined ? {} : { params }),
      });
      expect({ name, ids: await read(user) }).toEqual({ name, ids: [] });
    }
  });

  it('follows an owner who transfers between departments', async () => {
    const viewerA = await holder('scTransferA', SCOPE_MY_DEPARTMENTS, ['sc-a']);
    const viewerB = await holder('scTransferB', SCOPE_MY_DEPARTMENTS, ['sc-b']);
    expect(await read(viewerA)).toEqual(['sc-a']);

    // Owner-based scope follows the person: the project moves with its owner.
    await test.organization.addMember({
      departmentId: 'sc-b',
      userId: owners.a.id,
      primary: true,
    });
    await test.organization.removeMember('sc-a', owners.a.id);
    try {
      expect(await read(viewerA)).toEqual([]);
      expect(await read(viewerB)).toEqual(['sc-a', 'sc-b']);
    } finally {
      await test.organization.addMember({
        departmentId: 'sc-a',
        userId: owners.a.id,
        primary: true,
      });
      await test.organization.removeMember('sc-b', owners.a.id);
    }
  });
});
