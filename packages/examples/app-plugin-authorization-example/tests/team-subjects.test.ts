import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createFixture } from './helpers.js';
import { TEAM_SUBJECT } from '../server/sales-teams.js';

let fixture: Awaited<ReturnType<typeof createFixture>>;
beforeEach(async () => {
  fixture = await createFixture();
});
afterEach(async () => {
  await fixture.database.disconnect();
});

function request(
  section: string,
  query = '',
  ids?: string[],
  user = fixture.users.assistant,
) {
  return fixture.router.request(
    `/api/authz/${section}/subjects/${TEAM_SUBJECT}${ids ? '/resolve' : query}`,
    {
      method: ids ? 'POST' : 'GET',
      headers: { 'x-test-user': user, 'content-type': 'application/json' },
      ...(ids ? { body: JSON.stringify({ ids }) } : {}),
    },
  );
}

async function grantSettings(section: string) {
  const key = `settings-${section}`;
  await fixture.authorization.permissionSets.create({
    key,
    grants: [
      fixture.authorization.settings.grant(`authorization.${section}`, [
        section === 'inspector' ? 'inspect' : 'read',
      ]),
    ],
  });
  await fixture.authorization.permissionSets.assign({
    permissionSet: key,
    subject: { type: 'user', id: fixture.users.assistant },
  });
}

it.each([
  'permission-sets',
  'default-access',
  'sharing-rules',
  'restriction-rules',
  'inspector',
])(
  'uses the %s entry permission for team listing and name resolution',
  async (section) => {
    expect((await request(section, '', undefined, '')).status).toBe(401);
    expect((await request(section)).status).toBe(403);

    expect((await request(section, '', ['proposal'])).status).toBe(403);
    expect((await request(section, '', [])).status).toBe(403);
    await grantSettings(section);
    const list = await request(section);
    expect(list.status).toBe(200);
    expect((await list.json()).data).toMatchObject({ total: 2 });
    const names = await request(section, '', ['proposal']);
    expect(names.status).toBe(200);
    expect((await names.json()).data).toEqual([
      { id: 'proposal', title: 'Proposal team' },
    ]);
  },
);

it('searches literal text, paginates stably, and resolves only requested active teams', async () => {
  await grantSettings('permission-sets');
  await fixture.database
    .connection()
    .query.insertInto('authorizationExampleTeams')
    .values([
      { id: 'beta', title: 'Mixed_100% team', active: true },
      { id: 'alpha', title: 'Mixed_100% team', active: true },
      { id: 'inactive', title: 'Mixed_100% team', active: false },
      { id: 'wildcard', title: 'MixedX100Y team', active: true },
    ])
    .execute();
  const query = '?search=mIXED_100%25&pageSize=1&page=';
  for (const [page, id] of [
    [1, 'alpha'],
    [2, 'beta'],
    [3, undefined],
  ] as const) {
    const response = await request('permission-sets', `${query}${page}`);
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({
      items: id ? [{ id, title: 'Mixed_100% team' }] : [],
      total: 2,
    });
  }
  const resolved = await request('permission-sets', '', [
    'alpha',
    'inactive',
    'missing',
  ]);
  expect((await resolved.json()).data).toEqual([
    { id: 'alpha', title: 'Mixed_100% team' },
  ]);
  expect(
    (await (await request('permission-sets', '', [])).json()).data,
  ).toEqual([]);
});

it('filters active IDs through the caller transaction and respects rollback', async () => {
  const subjects = fixture.authorization.subjects;
  const proposal = { type: TEAM_SUBJECT, id: 'proposal' };
  const delivery = { type: TEAM_SUBJECT, id: 'delivery' };
  const connection = fixture.database.connection();
  const rollback = new Error('rollback');
  await expect(
    connection.transaction(async (transaction) => {
      await transaction.query
        .updateTable('authorizationExampleTeams')
        .set({ active: false })
        .where('id', '=', 'proposal')
        .execute();
      const fallback = vi
        .spyOn(fixture.database, 'connection')
        .mockImplementation(() => {
          throw new Error(
            'The active-subject check must use the caller transaction',
          );
        });
      try {
        expect(
          await subjects.filterActive(
            [proposal, delivery, { type: TEAM_SUBJECT, id: 'missing' }],
            transaction,
          ),
        ).toEqual([delivery]);
        expect(
          await subjects.get(TEAM_SUBJECT)!.filterActive([], transaction),
        ).toEqual([]);
      } finally {
        fallback.mockRestore();
      }
      throw rollback;
    }),
  ).rejects.toBe(rollback);
  expect(await subjects.filterActive([proposal])).toEqual([proposal]);
});
