// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { definePermissionSet } from '@nocobase/authorization/permission-sets';
import { DEPARTMENT_SUBJECT } from '../server/index.js';
import { ADMIN, createTestApp, createTree, type TestApp } from './helpers.js';

interface Option {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly manage?: string;
}

const SURFACE = '/api/authz/permission-sets/subjects/org.department';

describe('the department subject type', () => {
  let test: TestApp;
  let admin: string;

  beforeAll(async () => {
    test = await createTestApp();
    admin = await test.signIn(ADMIN.email, ADMIN.password);
  }, 60_000);

  afterAll(async () => {
    await test.close();
  });

  async function get<T>(pathname: string): Promise<T> {
    const response = await test.request('GET', pathname, { cookie: admin });
    expect(response.status).toBe(200);
    return ((await response.json()) as { data: T }).data;
  }

  async function list(
    query: string,
  ): Promise<{ items: Option[]; total: number }> {
    return get(`${SURFACE}?${query}`);
  }

  it('is announced with members and manage', async () => {
    const options = await get<{
      subjectTypes: { type: string; members?: boolean; manage?: boolean }[];
    }>('/api/authz/permission-sets/options');
    expect(
      options.subjectTypes.find((type) => type.type === DEPARTMENT_SUBJECT),
    ).toMatchObject({ members: true, manage: true });
  });

  it('is listed and resolved only with the permission-sets settings entry', async () => {
    await test.organization.createDepartment({
      id: 'gate-1',
      title: 'Gate department',
    });
    const user = await test.signUp('subjectGate');
    const list = (cookie?: string): Promise<Response> =>
      test.request('GET', `${SURFACE}?page=1&pageSize=10&search=Gate`, {
        cookie,
      });
    const resolve = (ids: string[], cookie?: string): Promise<Response> =>
      test.request('POST', `${SURFACE}/resolve`, { cookie, json: { ids } });

    expect((await list()).status).toBe(401);
    expect((await resolve(['gate-1'])).status).toBe(401);
    expect((await list(user.cookie)).status).toBe(403);
    expect((await resolve(['gate-1'], user.cookie)).status).toBe(403);
    expect((await resolve([], user.cookie)).status).toBe(403);

    const set = definePermissionSet('subject-gate')
      .grant(
        test.authz.settings.grant('authorization.permission-sets', ['read']),
      )
      .build();
    await test.authz.permissionSets.create(set);
    await test.authz.permissionSets.assign({
      permissionSet: set.key,
      subject: { type: 'user', id: user.id },
    });

    const listed = await list(user.cookie);
    expect(listed.status).toBe(200);
    expect(
      ((await listed.json()) as { data: { total: number } }).data.total,
    ).toBe(1);
    const resolved = await resolve(['gate-1'], user.cookie);
    expect(resolved.status).toBe(200);
    expect(((await resolved.json()) as { data: Option[] }).data).toEqual([
      expect.objectContaining({ id: 'gate-1', title: 'Gate department' }),
    ]);
    const empty = await resolve([], user.cookie);
    expect(((await empty.json()) as { data: Option[] }).data).toEqual([]);
  });

  describe('selection', () => {
    it('matches the search as literal text', async () => {
      const { organization } = test;
      await organization.createDepartment({
        id: 'lit-1',
        title: '100% Growth',
      });
      await organization.createDepartment({
        id: 'lit-2',
        title: '1000 Growth',
      });
      await organization.createDepartment({ id: 'lit-3', title: 'A_B Team' });
      await organization.createDepartment({ id: 'lit-4', title: 'AxB Team' });

      const percent = await list('search=%25&page=1&pageSize=30');
      expect(percent.items.map((item) => item.id)).toEqual(['lit-1']);
      const underscore = await list('search=_&page=1&pageSize=30');
      expect(underscore.items.map((item) => item.id)).toEqual(['lit-3']);
      const insensitive = await list('search=growth&page=1&pageSize=30');
      expect(insensitive.items.map((item) => item.id)).toEqual([
        'lit-1',
        'lit-2',
      ]);
    });

    it('pages in a stable order and lists active departments only', async () => {
      for (const id of ['pg-e', 'pg-c', 'pg-a', 'pg-d', 'pg-b'])
        await test.organization.createDepartment({ id, title: 'Same title' });
      await test.organization.setActive('pg-e', false);

      const pages = [];
      for (const page of [1, 2, 3])
        pages.push(await list(`search=Same%20title&page=${page}&pageSize=2`));
      expect(pages.map((page) => page.total)).toEqual([4, 4, 4]);
      expect(pages.map((page) => page.items.map((item) => item.id))).toEqual([
        ['pg-a', 'pg-b'],
        ['pg-c', 'pg-d'],
        [],
      ]);
    });

    it('resolves the requested ids, marks disabled ones and links to their page', async () => {
      await createTree(test.organization, [
        ['res-root', null],
        ['res-child', 'res-root'],
      ]);
      await test.organization.setActive('res-root', false);

      const response = await test.request('POST', `${SURFACE}/resolve`, {
        cookie: admin,
        json: { ids: ['res-child', 'res-missing', 'hq'] },
      });
      expect(response.status).toBe(200);
      const items = ((await response.json()) as { data: Option[] }).data;
      expect(items).toEqual([
        {
          id: 'res-child',
          title: 'Dept res-child',
          description: 'Disabled · Dept res-root',
          manage: '/settings/organization/departments/res-child',
        },
        {
          id: 'hq',
          title: 'Headquarters',
          manage: '/settings/organization/departments/hq',
        },
      ]);
    });
  });

  describe('filterActive', () => {
    it('reads through the caller transaction and respects its rollback', async () => {
      await createTree(test.organization, [
        ['fa-root', null],
        ['fa-child', 'fa-root'],
        ['fa-leaf', 'fa-child'],
      ]);
      const type = test.authz.subjects.get(DEPARTMENT_SUBJECT);
      if (!type) throw new Error('The department subject type is missing');
      const ids = ['fa-root', 'fa-child', 'fa-leaf'];
      const connection = vi.spyOn(test.database, 'connection');

      class Rollback extends Error {}
      await expect(
        test.database.transaction(async (transaction) => {
          await transaction.query
            .updateTable('departments')
            .set({ active: false })
            .where('id', '=', 'fa-child')
            .execute();
          connection.mockClear();
          // Disabling the child drops it and its descendant, read through the transaction alone.
          expect(
            await type.filterActive([...ids, 'fa-missing'], transaction),
          ).toEqual(['fa-root']);
          expect(await type.filterActive([], transaction)).toEqual([]);
          expect(connection).not.toHaveBeenCalled();
          throw new Rollback();
        }),
      ).rejects.toBeInstanceOf(Rollback);
      connection.mockRestore();

      expect(await type.filterActive(ids)).toEqual(ids);
    });
  });

  describe('members', () => {
    it('pages and searches the effective members, descendants included, and names each direct department', async () => {
      const { organization } = test;
      await createTree(organization, [
        ['mem-root', null],
        ['mem-child', 'mem-root'],
        ['mem-leaf', 'mem-child'],
        ['mem-off', 'mem-root'],
      ]);
      await organization.setActive('mem-off', false);
      const root = await test.signUp('memRoot');
      const child = await test.signUp('memChild');
      const leaf = await test.signUp('memLeafOnly');
      const both = await test.signUp('memBoth');
      const off = await test.signUp('memOff');
      await organization.addMember({
        departmentId: 'mem-root',
        userId: root.id,
      });
      await organization.addMember({
        departmentId: 'mem-child',
        userId: child.id,
      });
      await organization.addMember({
        departmentId: 'mem-leaf',
        userId: leaf.id,
      });
      await organization.addMember({
        departmentId: 'mem-child',
        userId: both.id,
      });
      await organization.addMember({
        departmentId: 'mem-leaf',
        userId: both.id,
      });
      await organization.addMember({ departmentId: 'mem-off', userId: off.id });

      const members = `${SURFACE}/mem-root/members`;
      const first = await get<{ items: Option[]; total: number }>(
        `${members}?page=1&pageSize=3`,
      );
      const second = await get<{ items: Option[]; total: number }>(
        `${members}?page=2&pageSize=3`,
      );
      expect(first.total).toBe(4);
      expect(first.items).toHaveLength(3);
      expect(second.items).toHaveLength(1);
      const all = [...first.items, ...second.items];
      expect(all.map((item) => item.id).sort()).toEqual(
        [root.id, child.id, leaf.id, both.id].sort(),
      );
      expect(all.find((item) => item.id === both.id)?.description).toBe(
        'Dept mem-child, Dept mem-leaf',
      );
      expect(all.find((item) => item.id === leaf.id)?.description).toBe(
        'Dept mem-leaf',
      );

      const searched = await get<{ items: Option[]; total: number }>(
        `${members}?page=1&pageSize=10&search=memleafonly`,
      );
      expect(searched.items.map((item) => item.id)).toEqual([leaf.id]);

      const leafOnly = await get<{ items: Option[]; total: number }>(
        `${SURFACE}/mem-leaf/members?page=1&pageSize=10`,
      );
      expect(leafOnly.items.map((item) => item.id).sort()).toEqual(
        [leaf.id, both.id].sort(),
      );
    });
  });
});
