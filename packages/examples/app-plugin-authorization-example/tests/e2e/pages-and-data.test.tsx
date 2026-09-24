// @vitest-environment jsdom
import { useState } from 'react';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { selection } from '@nocobase/authorization/core';
// The permission-set editor, its drafts and its option localizer are private to the plugin.
import { PermissionSetEditor } from '../../../../plugins/app-plugin-authorization/client/pages/permission-sets/editor.js';
import {
  fromSet,
  toInput,
} from '../../../../plugins/app-plugin-authorization/client/pages/permission-sets/drafts.js';
import { findResource } from '@nocobase/app-plugin-authorization/client/management';
import { localizeOptions } from '../../../../plugins/app-plugin-authorization/client/components/localized-options.js';
import type {
  AuthorizationOptionsResponse,
  PermissionSet,
} from '@nocobase/app-plugin-authorization/client';
import { PROJECTS, QUOTES } from '../../server/sales-authorization.js';
import { projectReference } from '../../server/sales-resources.js';
import type { DefaultAccessAuthorizationApi } from '@nocobase/authorization/default-access';
import type { SharingRulesAuthorizationApi } from '@nocobase/authorization/sharing-rules';
import type { RestrictionRulesAuthorizationApi } from '@nocobase/authorization/restriction-rules';
import {
  adminRequest,
  createFixture,
  listIds,
  type SalesFixture,
} from '../helpers.js';

vi.mock('@nocobase/i18n/client', async () => {
  const { translate } = await import('../locale-harness.js');
  const { default: example } = await import('../../client/locales/en-US.js');
  return {
    useTranslation: () => ({
      t: (key: string, options?: Record<string, unknown>) => {
        if (options?.ns === '@nocobase/app-plugin-authorization-example')
          return (
            key
              .split('.')
              .reduce<unknown>(
                (value, key) =>
                  value && typeof value === 'object'
                    ? Reflect.get(value, key)
                    : undefined,
                example,
              ) ?? key
          );
        return translate(key, options);
      },
    }),
  };
});

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

it('grants page entry separately while data rules govern real endpoints, independently in both directions', async () => {
  expect(await ids('assistant')).toEqual([
    'project-1',
    'project-2',
    'project-3',
  ]);
  expect(await ids('assistant', 'quotes')).toEqual([
    'quote-1',
    'quote-history-1',
  ]);
  expect(await ids('engineer')).toEqual([
    'project-1',
    'project-2',
    'project-3',
  ]);
  expect(await ids('manager')).toEqual(['project-3']);
  expect(
    (
      await fixture.request('assistant', 'salesProjects:updateOne', {
        filter: { id: 'project-2' },
        values: {
          notes: 'Not allowed',
        },
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await fixture.request('engineer', 'salesProjects:updateOne', {
        filter: { id: 'project-2' },
        values: {
          notes: 'Updated',
        },
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await fixture.request('engineer', 'salesProjects:updateOne', {
        filter: { id: 'project-4' },
        values: {
          notes: 'Secret',
        },
      })
    ).status,
  ).toBe(404);
  expect(
    await authz
      .for({ principal: { type: 'user', id: fixture.users.assistant } })
      .can({
        resource: { type: 'page', id: 'example.sales.projects' },
        action: 'access',
      }),
  ).toBe(true);
  expect(
    (await fixture.router.request('/api/authorization-example/sales/projects'))
      .status,
  ).toBe(401);
  const identity = { principal: { type: 'user', id: fixture.users.assistant } };
  const set = (await authz.permissionSets.get('example-sales-assistant'))!;
  const pageGrant = set.grants.find(
    (grant) =>
      grant.resource.type === 'page' &&
      grant.resource.id === 'example.sales.projects',
  )!;
  const dataGrant = set.grants.find(
    (grant) =>
      grant.resource.type === 'composite' &&
      grant.resource.id === 'example.sales.projects',
  )!;
  const pageRequest = {
    resource: { type: 'page', id: 'example.sales.projects' },
    action: 'access',
  };
  await authz.permissionSets.update(set.key, { ...set, grants: [pageGrant] });
  expect(await authz.for(identity).can(pageRequest)).toBe(true);
  expect((await fixture.request('assistant', 'sales/projects')).status).toBe(
    403,
  );
  await authz.permissionSets.update(set.key, { ...set, grants: [dataGrant] });
  expect(await authz.for(identity).can(pageRequest)).toBe(false);
  expect((await fixture.request('assistant', 'sales/projects')).status).toBe(
    200,
  );
  const decision = await authz.for(identity).authorize({
    resource: { type: 'composite', id: 'example.sales.projects' },
    action: 'view',
  });
  expect(
    decision.conditions?.checks.every(
      (check) => check.resource.type === 'database.collection',
    ),
  ).toBe(true);
});

it('saves one operation scope from the real editor without changing view or quote scopes', async () => {
  const response = await admin('permission-sets/options');
  const raw = (await response.json()).data as AuthorizationOptionsResponse;
  const { translate } = await import('../locale-harness.js');
  const example = (await import('../../client/locales/en-US.js')).default;
  const options = localizeOptions(raw, (key, params) =>
    params?.ns === '@nocobase/app-plugin-authorization-example'
      ? String(
          key
            .split('.')
            .reduce<unknown>(
              (value, key) =>
                value && typeof value === 'object'
                  ? Reflect.get(value, key)
                  : undefined,
              example,
            ) ?? key,
        )
      : translate(key, params),
  );
  expect(
    findResource(options, { type: 'composite', id: 'example.sales.projects' })
      ?.dataScopes?.edit,
  ).toBeDefined();
  const set = (await authz.permissionSets.get('example-sales-assistant'))!;
  let saved = false;
  function Editor() {
    const [draft, setDraft] = useState(() => fromSet(set as PermissionSet));
    return (
      <MemoryRouter>
        <PermissionSetEditor
          dirty={true}
          options={options}
          draft={draft}
          busy={false}
          onChange={setDraft}
          onClose={() => {}}
          onSave={async (event) => {
            event.preventDefault();
            expect(
              (await admin(`permission-sets/${set.key}`, 'PUT', toInput(draft)))
                .status,
            ).toBe(200);
            saved = true;
          }}
        />
      </MemoryRouter>
    );
  }
  render(<Editor />);
  fireEvent.click(
    screen.getByRole('button', { name: 'Projects: Edit project information' }),
  );
  fireEvent.click(
    await screen.findByRole('radio', {
      name: 'Configure permission',
      exact: true,
    }),
  );
  fireEvent.click(
    screen.getByRole('checkbox', { name: 'Specify scope: Projects' }),
  );
  fireEvent.click(screen.getByRole('combobox', { name: 'Projects' }));
  const selectedOption = await screen.findByRole('option', {
    name: 'My region',
  });
  fireEvent.pointerDown(selectedOption, { pointerType: 'mouse' });
  fireEvent.mouseUp(selectedOption);
  fireEvent.click(selectedOption);
  fireEvent.click(screen.getByRole('button', { name: 'Back to resources' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save permission set' }));
  await waitFor(() => expect(saved).toBe(true));
  expect(
    (await authz.permissionSets.get(set.key))?.grants.find(
      (grant) =>
        grant.resource.type === 'composite' &&
        grant.resource.id === 'example.sales.projects',
    )?.actions,
  ).toContainEqual({
    action: 'edit',
    policy: { type: 'composite', scopes: { projects: 'example.sales.region' } },
  });
  expect(await ids('assistant')).toEqual([
    'project-1',
    'project-2',
    'project-3',
  ]);
  expect(
    (
      await fixture.request('assistant', 'salesProjects:updateOne', {
        filter: { id: 'project-1' },
        values: {
          notes: 'Saved from UI grant',
        },
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await fixture.request('assistant', 'salesProjects:updateOne', {
        filter: { id: 'project-2' },
        values: {
          notes: 'Regional edit independently allows this row',
        },
      })
    ).status,
  ).toBe(200);
  await authz.defaultAccess.create({
    key: 'all-quotes',
    resource: { type: 'database.collection', id: QUOTES },
    actions: [{ action: 'read', selection: selection.all() }],
  });
  expect(await ids('assistant', 'quotes')).toEqual([
    'quote-1',
    'quote-2',
    'quote-3',
    'quote-5',
    'quote-6',
    'quote-7',
    'quote-8',
    'quote-history-1',
    'quote-history-2',
    'quote-history-3',
    'quote-history-8',
  ]);
});

it('keeps all-region read separate from engineer edit, including direct repository policies', async () => {
  await authz.permissionSets.create({
    key: 'extra-read',
    grants: [projectReference.grant({ view: { projects: 'allRecords' } })],
  });
  await authz.permissionSets.assign({
    subject: { type: 'user', id: fixture.users.engineer },
    permissionSet: 'extra-read',
  });
  expect(await ids('engineer')).toEqual([
    'project-1',
    'project-2',
    'project-3',
    'project-8',
  ]);
  expect(
    (
      await fixture.request('engineer', 'salesProjects:updateOne', {
        filter: { id: 'project-3' },
        values: {
          notes: 'Cross-region',
        },
      })
    ).status,
  ).toBe(404);
  const scope = authz.for({
    principal: { type: 'user', id: fixture.users.engineer },
  });
  const policy = await authz.database.policyFor(PROJECTS, scope);
  await expect(
    fixture.database
      .repository(PROJECTS)
      .withPolicy(policy)
      .updateOne({
        filter: { id: 'project-3' },
        values: { notes: 'Bypass attempt' },
      }),
  ).rejects.toThrow();
});

it('separates project editing, quote submission and delivery with server-side state transitions', async () => {
  expect(
    (
      await fixture.request('engineer', 'salesProjects:updateOne', {
        filter: { id: 'project-2' },
        values: {
          title: 'Revised project',
          notes: 'Qualified',
        },
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await fixture.request('engineer', 'salesProjects:updateOne', {
        filter: { id: 'project-2' },
        values: {
          ownerId: fixture.users.assistant,
        },
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await fixture.request('engineer', 'sales/quotes/quote-2', {
        amount: 15000,
        notes: 'Final price',
      })
    ).status,
  ).toBe(200);
  expect(
    (await fixture.request('assistant', 'sales/quotes/quote-1/submit', {}))
      .status,
  ).toBe(403);
  expect(
    (await fixture.request('engineer', 'sales/quotes/quote-2/submit', {}))
      .status,
  ).toBe(200);
  expect(
    (await fixture.request('engineer', 'sales/quotes/quote-2', { amount: 1 }))
      .status,
  ).toBe(409);
  expect(
    (await fixture.request('engineer', 'sales/quotes/quote-2/submit', {}))
      .status,
  ).toBe(409);
  expect(await ids('delivery', 'orders')).toEqual(['order-1', 'order-2']);
  expect((await fixture.request('delivery', 'sales/projects')).status).toBe(
    403,
  );
  for (const deliveryReference of [null, '', '   ']) {
    expect(
      (
        await fixture.request('delivery', 'sales/orders/order-2/deliver', {
          deliveryReference,
        })
      ).status,
    ).toBe(400);
  }
  expect(
    (
      await fixture.request('delivery', 'sales/orders/order-2/deliver', {
        deliveryReference: 'SHIP-200',
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await fixture.request('delivery', 'sales/orders/order-2/deliver', {
        deliveryReference: 'SHIP-201',
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await fixture.request('delivery', 'sales/orders/order-3/deliver', {
        deliveryReference: 'SHIP-300',
      })
    ).status,
  ).toBe(403);
});

it('reports per-record edit eligibility and input errors without mislabeling permission denial', async () => {
  const data = (
    await (await fixture.request('engineer', 'sales/projects')).json()
  ).data;
  expect(
    data.items.find((row: { id: string }) => row.id === 'project-3').operations
      .edit,
  ).toBe('outsideScope');
  expect(
    data.items.find((row: { id: string }) => row.id === 'project-2').operations
      .edit,
  ).toBe('allowed');
  expect(
    (await fixture.request('engineer', 'sales/quotes/quote-2', { amount: 0 }))
      .status,
  ).toBe(200);
  const quotes = (
    await (await fixture.request('engineer', 'sales/quotes')).json()
  ).data;
  expect(
    quotes.items.find((row: { id: string }) => row.id === 'quote-2').operations
      .submit,
  ).toBe('invalidAmount');
  expect(
    (await fixture.request('engineer', 'sales/quotes/quote-2/submit', {}))
      .status,
  ).toBe(400);
});

it('lets engineers prepare their own quotes and requires an explicit handover to edit a colleague quote', async () => {
  expect(
    (
      await fixture.request('engineer', 'sales/quotes/quote-5', {
        amount: 16000,
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await fixture.request('engineer', 'sales/quotes/quote-6', {
        amount: 19000,
      })
    ).status,
  ).toBe(200);
  expect(
    (await fixture.request('engineer', 'sales/quotes/quote-6/submit', {}))
      .status,
  ).toBe(403);
  expect(
    (
      await fixture.request('proposal', 'sales/quotes/quote-7', {
        amount: 22000,
      })
    ).status,
  ).toBe(200);
  const rule = (await authz.sharingRules.get('example-proposal-handover'))!;
  expect(
    (
      await admin('sharing-rules/example-proposal-handover', 'PUT', {
        ...rule,
        subjects: [],
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await fixture.request('proposal', 'sales/quotes/quote-7', {
        amount: 23000,
      })
    ).status,
  ).toBe(403);
  expect(
    (await fixture.request('proposal', 'sales/quotes/quote-7/submit', {}))
      .status,
  ).toBe(403);
  expect(
    (
      await fixture.request('engineer', 'sales/quotes/quote-2', {
        amount: 13000,
      })
    ).status,
  ).toBe(200);
});

it('separates project-region and quote-preparer scopes through the real submit endpoint', async () => {
  const response = await fixture.request('engineer', 'sales/quotes');
  const body = (await response.json()).data;
  expect(body.items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: 'quote-2',
        projectId: 'project-2',
        preparedByName: 'Morgan Lee',
        operations: expect.objectContaining({ submit: 'allowed' }),
      }),
      expect.objectContaining({
        id: 'quote-5',
        projectId: 'project-2',
        preparedByName: 'Alex Chen',
        operations: expect.objectContaining({ submit: 'quoteScope' }),
      }),
      expect.objectContaining({
        id: 'quote-6',
        projectId: 'project-3',
        preparedByName: 'Morgan Lee',
        operations: expect.objectContaining({ submit: 'projectScope' }),
      }),
    ]),
  );
  expect(
    (await fixture.request('engineer', 'sales/quotes/quote-2/submit', {}))
      .status,
  ).toBe(200);
  expect(
    (await fixture.request('engineer', 'sales/quotes/quote-5/submit', {}))
      .status,
  ).toBe(403);
  expect(
    (await fixture.request('engineer', 'sales/quotes/quote-6/submit', {}))
      .status,
  ).toBe(403);
  expect(
    (await fixture.request('engineer', 'sales/quotes/quote-4/submit', {}))
      .status,
  ).toBe(403);
});

it('grants independent page entries and keeps delivery-only accounts out of sales menus and APIs', async () => {
  const scope = authz.for({
    principal: { type: 'user', id: fixture.users.delivery },
  });
  expect(
    await scope.can({
      resource: { type: 'page', id: 'example.sales.orders' },
      action: 'access',
    }),
  ).toBe(true);
  for (const name of ['projects', 'quotes']) {
    expect(
      await scope.can({
        resource: { type: 'page', id: `example.sales.${name}` },
        action: 'access',
      }),
    ).toBe(false);
    expect((await fixture.request('delivery', `sales/${name}`)).status).toBe(
      403,
    );
  }
  const data = (
    await (await fixture.request('delivery', 'sales/orders')).json()
  ).data;
  expect(
    data.items.every((row: { project?: unknown }) => row.project === undefined),
  ).toBe(true);
  expect(data.navigation).toEqual({
    projects: false,
    quotes: false,
    orders: true,
  });
  expect(data.items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: 'order-2',
        projectId: 'project-2',
        quoteId: 'quote-history-2',
      }),
    ]),
  );
});
