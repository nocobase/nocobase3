// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createTestApp,
  createTree,
  directorySet,
  readDirectory,
  type TestApp,
  type TestUser,
} from './helpers.js';

interface Case {
  /** Holds the set only through the department tree. */
  readonly inherited: TestUser;
  /** Holds the same set through the tree and directly. */
  readonly direct: TestUser;
  readonly assignmentId: string;
  readonly ids: { root: string; child: string; leaf: string };
}

/**
 * Each case gets its own tree `root > child > leaf`, a permission set assigned to `root`, and two members of
 * `leaf`; the second also holds the set through a direct user assignment.
 */
async function setUp(test: TestApp, name: string): Promise<Case> {
  const ids = { root: `${name}`, child: `${name}-child`, leaf: `${name}-leaf` };
  await createTree(test.organization, [
    [ids.root, null],
    [ids.child, ids.root],
    [ids.leaf, ids.child],
  ]);
  const set = directorySet(`${name}-set`);
  await test.authz.permissionSets.create(set);
  const assignment = await test.authz.permissionSets.assign({
    permissionSet: set.key,
    subject: { type: 'org.department', id: ids.root },
  });
  const inherited = await test.signUp(`${name}Inherited`);
  const direct = await test.signUp(`${name}Direct`);
  for (const user of [inherited, direct])
    await test.organization.addMember({
      departmentId: ids.leaf,
      userId: user.id,
    });
  await test.authz.permissionSets.assign({
    permissionSet: set.key,
    subject: { type: 'user', id: direct.id },
  });
  return { inherited, direct, assignmentId: assignment.id, ids };
}

describe('a permission set assigned to a department', () => {
  let test: TestApp;

  beforeAll(async () => {
    test = await createTestApp();
  }, 60_000);

  afterAll(async () => {
    await test.close();
  });

  it('reaches direct members and the members of every department below it', async () => {
    const { inherited, ids } = await setUp(test, 'reach');
    const directMember = await test.signUp('reachRoot');
    await test.organization.addMember({
      departmentId: ids.root,
      userId: directMember.id,
    });

    // The leaf member's chain is leaf, child and root; record access selects exactly that chain.
    expect(await readDirectory(test, inherited.cookie)).toEqual({
      status: 200,
      ids: [ids.root, ids.child, ids.leaf].sort(),
    });
    expect(await readDirectory(test, directMember.cookie)).toEqual({
      status: 200,
      ids: [ids.root],
    });
    const snapshot = await test.request('GET', '/api/authz/permissions', {
      cookie: inherited.cookie,
    });
    expect(JSON.stringify(await snapshot.json())).toContain('org.directory');

    const outsider = await test.signUp('reachOutsider');
    expect((await readDirectory(test, outsider.cookie)).status).toBe(403);
  });

  it('is revoked by removing the member', async () => {
    const { inherited, direct, ids } = await setUp(test, 'remove');
    await test.organization.removeMember(ids.leaf, inherited.id);
    await test.organization.removeMember(ids.leaf, direct.id);

    expect((await readDirectory(test, inherited.cookie)).status).toBe(403);
    // The direct assignment keeps the action; the departments left are none of the user's any more.
    expect(await readDirectory(test, direct.cookie)).toEqual({
      status: 200,
      ids: [],
    });
  });

  it('is revoked by unassigning the set from the department', async () => {
    const { inherited, direct, assignmentId, ids } = await setUp(
      test,
      'unassign',
    );
    await test.authz.permissionSets.revoke(assignmentId);

    expect((await readDirectory(test, inherited.cookie)).status).toBe(403);
    expect(await readDirectory(test, direct.cookie)).toEqual({
      status: 200,
      ids: [ids.root, ids.child, ids.leaf].sort(),
    });
  });

  it('is revoked by disabling the department', async () => {
    const { inherited, direct, ids } = await setUp(test, 'disable');
    await test.organization.setActive(ids.leaf, false);

    expect((await readDirectory(test, inherited.cookie)).status).toBe(403);
    expect((await readDirectory(test, direct.cookie)).status).toBe(200);
  });

  it('is revoked by disabling an ancestor department', async () => {
    const { inherited, direct, ids } = await setUp(test, 'ancestor');
    await test.organization.setActive(ids.root, false);

    expect((await readDirectory(test, inherited.cookie)).status).toBe(403);
    expect((await readDirectory(test, direct.cookie)).status).toBe(200);

    // Re-enabling the ancestor restores the inheritance; no child row was rewritten.
    await test.organization.setActive(ids.root, true);
    expect(await readDirectory(test, inherited.cookie)).toEqual({
      status: 200,
      ids: [ids.root, ids.child, ids.leaf].sort(),
    });
  });
});
