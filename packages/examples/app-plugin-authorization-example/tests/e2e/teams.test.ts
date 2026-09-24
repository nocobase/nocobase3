import { afterEach, beforeEach, expect, it } from 'vitest';
import { cleanup } from '@testing-library/react';
import type { DefaultAccessAuthorizationApi } from '@nocobase/authorization/default-access';
import type { SharingRulesAuthorizationApi } from '@nocobase/authorization/sharing-rules';
import type { RestrictionRulesAuthorizationApi } from '@nocobase/authorization/restriction-rules';
import {
  adminRequest,
  createFixture,
  listIds,
  type SalesFixture,
} from '../helpers.js';

type SalesAuthorization = SalesFixture['authorization'] &
  DefaultAccessAuthorizationApi &
  SharingRulesAuthorizationApi &
  RestrictionRulesAuthorizationApi;

let fixture: SalesFixture;
let authz: SalesAuthorization;
beforeEach(async () => {
  fixture = await createFixture();
  authz = fixture.authorization as SalesAuthorization;
  await authz.permissionSets.create({ key: 'root', grants: [] });
  await authz.permissionSets.assign({
    subject: { type: 'user', id: fixture.users.admin },
    permissionSet: 'root',
  });
});
afterEach(async () => {
  cleanup();
  await fixture.database.disconnect();
});
const admin = (path: string, method?: string, body?: unknown) =>
  adminRequest(fixture, path, method, body);
const ids = (user: string, path?: string) => listIds(fixture, user, path);

it.each([
  [
    'removing the member from the team',
    (fixture: SalesFixture) =>
      fixture.database
        .connection()
        .query.deleteFrom('authorizationExampleTeamMembers')
        .where('userId', '=', fixture.users.proposal)
        .execute(),
  ],
  [
    'unassigning the team role',
    (fixture: SalesFixture) =>
      fixture.database
        .connection()
        .query.deleteFrom('authorizationPermissionSetAssignments')
        .where('subjectType', '=', 'example.sales.team')
        .where('subjectId', '=', 'proposal')
        .execute(),
  ],
])(
  'inherits roles and shared records from teams, and revokes them on %s',
  async (_name, revoke) => {
    const submit = async (): Promise<unknown> =>
      (
        await (await fixture.request('proposal', 'sales/quotes')).json()
      ).data.items.find((row: { id: string }) => row.id === 'quote-7')
        .operations.submit;
    expect(await submit()).toBe('allowed');
    for (const quote of ['quote-5', 'quote-4'])
      expect(
        (await fixture.request('proposal', `sales/quotes/${quote}/submit`, {}))
          .status,
      ).toBe(403);
    const before = (await (await fixture.request('proposal', 'context')).json())
      .data;
    expect(before.roles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'example-sales-engineer',
          sources: [{ type: 'example.sales.team', id: 'proposal' }],
        }),
      ]),
    );

    await revoke(fixture);
    // Team sharing alone never grants the operation.
    expect(
      (await fixture.request('proposal', 'sales/quotes/quote-7/submit', {}))
        .status,
    ).toBe(403);
    expect((await fixture.request('proposal', 'sales/quotes')).status).toBe(
      403,
    );
    expect((await fixture.request('engineer', 'sales/quotes')).status).toBe(
      200,
    );
  },
);

it.each([
  [
    'the team is disabled',
    true,
    (fixture: SalesFixture) =>
      fixture.database
        .connection()
        .query.updateTable('authorizationExampleTeams')
        .set({ active: false })
        .where('id', '=', 'proposal')
        .execute(),
  ],
  [
    'the member leaves the team',
    false,
    (fixture: SalesFixture) =>
      fixture.database
        .connection()
        .query.deleteFrom('authorizationExampleTeamMembers')
        .where('userId', '=', fixture.users.coordinator)
        .execute(),
  ],
  [
    'the shared team role is revoked',
    true,
    async (fixture: SalesFixture) => {
      expect(
        (
          await adminRequest(
            fixture,
            'permission-sets/example-sales-engineer/assignments/example-team:proposal',
            'DELETE',
          )
        ).status,
      ).toBe(204);
    },
  ],
])(
  'keeps direct roles and the personal project when %s',
  async (_name, teamLosesAccess, revoke) => {
    const roles = async (): Promise<string[]> =>
      (
        await (await fixture.request('coordinator', 'context')).json()
      ).data.roles.map((role: { key: string }) => role.key);
    expect(
      (await authz.permissionSets.list()).filter((set) =>
        set.key.startsWith('example-sales-'),
      ),
    ).toHaveLength(4);
    expect(
      (await fixture.request('manager', 'sales/quotes/quote-3/submit', {}))
        .status,
    ).toBe(403);
    expect(await roles()).toEqual(
      expect.arrayContaining([
        'example-sales-manager',
        'example-sales-engineer',
      ]),
    );
    expect(
      (
        await fixture.request('coordinator', 'sales/quotes/quote-7', {
          amount: 23000,
        })
      ).status,
    ).toBe(200);

    await revoke(fixture);
    expect(await roles()).toContain('example-sales-manager');
    expect(await roles()).not.toContain('example-sales-engineer');
    expect(await ids('coordinator')).toEqual(['project-8']);
    for (const [project, status] of [
      ['project-8', 200],
      ['project-2', 404],
    ] as const)
      expect(
        (
          await fixture.request('coordinator', 'salesProjects:updateOne', {
            filter: { id: project },
            values: { notes: 'After the team change' },
          })
        ).status,
      ).toBe(status);
    expect(
      (
        await fixture.request('coordinator', 'sales/quotes/quote-7', {
          amount: 24000,
        })
      ).status,
    ).toBe(403);
    expect(
      (await fixture.request('coordinator', 'sales/quotes/quote-7/submit', {}))
        .status,
    ).toBe(403);
    expect(
      (await fixture.request('proposal', 'sales/projects')).status === 403,
    ).toBe(teamLosesAccess);
  },
);

it('requires both scopes of the cross-region team handover', async () => {
  const rule = await authz.sharingRules.get('example-proposal-handover');
  expect(rule).toBeDefined();
  for (const scopeKey of ['quotes', 'projects']) {
    expect(
      (
        await admin('sharing-rules/example-proposal-handover', 'PUT', {
          ...rule,
          actions: rule!.actions.filter(
            (action) => action.scopeKey === scopeKey,
          ),
        })
      ).status,
    ).toBe(200);
    const data = (
      await (await fixture.request('proposal', 'sales/quotes')).json()
    ).data;
    expect(
      data.items.find((row: { id: string }) => row.id === 'quote-7').operations
        .submit,
    ).toBe(scopeKey === 'quotes' ? 'projectScope' : 'quoteScope');
    expect(
      (await fixture.request('proposal', 'sales/quotes/quote-7/submit', {}))
        .status,
    ).toBe(403);
  }
  expect(
    (await admin('sharing-rules/example-proposal-handover', 'PUT', rule))
      .status,
  ).toBe(200);
  expect(
    (await fixture.request('proposal', 'sales/quotes/quote-7/submit', {}))
      .status,
  ).toBe(200);
});

it('explains a business action with its granting permission set and branch rules, and inspects a team member with the same memberships as live requests', async () => {
  const response = await admin('inspector/decision', 'POST', {
    subject: { type: 'user', id: fixture.users.assistant },
    resource: { type: 'composite', id: 'example.sales.projects' },
    action: 'view',
  });
  expect(response.status).toBe(200);
  const decision = (await response.json()).data;
  expect(decision.reasons).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        code: 'GRANT_MATCHED',
        details: expect.objectContaining({
          source: expect.objectContaining({ id: 'example-sales-assistant' }),
        }),
      }),
    ]),
  );
  const database = decision.checks.find(
    (check: { resource: { type: string } }) =>
      check.resource.type === 'database.collection',
  );
  expect(database.decision.reasons).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        code: 'SELECTION_EXPANDED',
        details: expect.objectContaining({
          source: expect.objectContaining({ plugin: 'sharing-rules' }),
        }),
      }),
      expect.objectContaining({
        code: 'SELECTION_RESTRICTED',
        details: expect.objectContaining({
          source: expect.objectContaining({ plugin: 'restriction-rules' }),
        }),
      }),
    ]),
  );
  const list = await admin('permission-sets/subjects/example.sales.team');
  expect(list.status).toBe(200);
  expect((await list.json()).data.items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: 'proposal' }),
      expect.objectContaining({ id: 'delivery' }),
    ]),
  );
  const member = await admin('inspector/decision', 'POST', {
    subject: { type: 'user', id: fixture.users.proposal },
    resource: { type: 'composite', id: 'example.sales.quotes' },
    action: 'submit',
  });
  expect(member.status).toBe(200);
  const memberDecision = (await member.json()).data;
  expect(memberDecision.effect).toBe('conditional');
  expect(memberDecision.reasons).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        code: 'SELECTION_EXPANDED',
        details: expect.objectContaining({
          source: expect.objectContaining({ plugin: 'sharing-rules' }),
        }),
      }),
      expect.objectContaining({ code: 'SELECTION_RESTRICTED' }),
    ]),
  );
  expect((await fixture.request('dispatch', 'sales/projects')).status).toBe(
    403,
  );
  expect(await ids('dispatch', 'orders')).toEqual(['order-1', 'order-2']);
});
