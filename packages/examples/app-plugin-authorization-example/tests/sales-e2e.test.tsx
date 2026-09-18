// @vitest-environment jsdom
import { useState } from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  cleanup,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createFixture } from './helpers.js';
import type { DefaultAccessAuthorizationApi } from '@nocobase/authorization/default-access';
import type { SharingRulesAuthorizationApi } from '@nocobase/authorization/sharing-rules';
import type { RestrictionRulesAuthorizationApi } from '@nocobase/authorization/restriction-rules';
type SalesAuthorization = Awaited<
  ReturnType<typeof createFixture>
>['authorization'] &
  DefaultAccessAuthorizationApi &
  SharingRulesAuthorizationApi &
  RestrictionRulesAuthorizationApi;
import { PROJECTS, QUOTES } from '../server/sales-authorization.js';
import { PermissionSetEditor } from '../../../plugins/app-plugin-authorization/client/pages/permission-sets/editor.js';
import {
  fromSet,
  toInput,
} from '../../../plugins/app-plugin-authorization/client/pages/permission-sets/drafts.js';
import { localizeOptions } from '../../../plugins/app-plugin-authorization/client/components/localized-options.js';
import type {
  AuthorizationOptions,
  LocalizedText,
  PermissionSet,
} from '../../../plugins/app-plugin-authorization/client/authorization-client.js';
vi.mock('@nocobase/i18n/client', async () => {
  const { translate } =
    await import('../../../plugins/app-plugin-authorization/tests/locale-harness.js');
  const { default: example } = await import('../client/locales/en-US.js');
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
let fixture: Awaited<ReturnType<typeof createFixture>>;
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
async function admin(
  path: string,
  method = 'GET',
  body?: unknown,
): Promise<Response> {
  return fixture.router.request(`/api/authz/${path}`, {
    method,
    headers: {
      'x-test-user': fixture.users.admin,
      'content-type': 'application/json',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function ids(user: string, path = 'projects'): Promise<string[]> {
  const response = await fixture.request(user, `sales/${path}`);
  expect(response.status).toBe(200);
  const body = await response.json();
  return body.data.items.map((item: { id: string }) => item.id);
}
it('composes page and table access; defaults, selected sharing and restrictions govern real endpoints', async () => {
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
      await fixture.request('assistant', 'sales/projects/project-2', {
        notes: 'Not allowed',
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await fixture.request('engineer', 'sales/projects/project-2', {
        notes: 'Updated',
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await fixture.request('engineer', 'sales/projects/project-4', {
        notes: 'Secret',
      })
    ).status,
  ).toBe(403);
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
});
it('saves all three rule types through their production HTTP routes and validates their targets', async () => {
  const resource = { type: 'resource', id: 'example.sales.projects' };
  const changed = await admin('default-access', 'PUT', {
    resource,
    actions: [{ action: 'view', scopeKey: 'projects', scope: { type: 'all' } }],
  });
  expect(await changed.json()).toMatchObject({
    data: {
      resource,
      actions: [
        { action: 'view', scopeKey: 'projects', scope: { type: 'all' } },
      ],
    },
  });
  expect(await ids('engineer')).toEqual([
    'project-1',
    'project-2',
    'project-3',
  ]);
  expect(
    (
      await admin(
        'restriction-rules/example-public-authorizationExampleProjects',
        'DELETE',
      )
    ).status,
  ).toBe(204);
  expect(await ids('engineer')).toEqual([
    'project-1',
    'project-2',
    'project-3',
    'project-4',
  ]);
  expect(
    (await admin('default-access', 'PUT', { resource, actions: [] })).status,
  ).toBe(200);
  expect(
    (await admin('sharing-rules/example-selected-projects', 'DELETE')).status,
  ).toBe(204);
  expect(await ids('assistant')).toEqual([]);
  expect(
    (
      await admin('sharing-rules', 'POST', {
        key: 'one',
        resource,
        subjects: [{ type: 'user', id: fixture.users.assistant }],
        actions: [
          {
            action: 'view',
            scopeKey: 'projects',
            selection: { type: 'records', ids: ['project-3'] },
          },
        ],
      })
    ).status,
  ).toBe(201);
  expect(await ids('assistant')).toEqual(['project-3']);
  for (const path of ['default-access', 'sharing-rules', 'restriction-rules']) {
    const response = await admin(`${path}/options`);
    expect(response.status).toBe(200);
    const options = (await response.json()).data;
    expect(
      options.resourceTypes[0].resources
        .find(
          (item: { value: string }) => item.value === 'example.sales.projects',
        )
        .actions.map((action: { value: string }) => action.value),
    ).toEqual(['view', 'edit']);
  }
  expect(
    (
      await admin('default-access', 'PUT', {
        resource: { type: 'resource', id: 'example.sales.projects' },
        actions: [
          { action: 'view', scopeKey: 'missing', scope: { type: 'all' } },
        ],
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await admin('sharing-rules', 'POST', {
        key: 'invalid',
        resource,
        subjects: [],
        actions: [
          {
            action: 'delete',
            selection: { type: 'records', ids: ['project-1'] },
          },
        ],
      })
    ).status,
  ).toBe(400);
});
it('saves one operation scope from the real editor without changing view or quote scopes', async () => {
  const response = await admin('permission-sets/options');
  const raw = (await response.json())
    .data as AuthorizationOptions<LocalizedText>;
  const { translate } =
    await import('../../../plugins/app-plugin-authorization/tests/locale-harness.js');
  const example = (await import('../client/locales/en-US.js')).default;
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
    options.resourceTypes
      .find((type) => type.value === 'resource')
      ?.resources.find(
        (resource) => resource.value === 'example.sales.projects',
      )?.actionScopes?.edit,
  ).toBeDefined();
  const set = (await authz.permissionSets.get('example-sales-assistant'))!;
  let saved = false;
  function Editor() {
    const [draft, setDraft] = useState(() => fromSet(set as PermissionSet));
    return (
      <PermissionSetEditor
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
    (await authz.permissionSets.get(set.key))?.grants[0].actions,
  ).toContainEqual({
    action: 'edit',
    policy: { type: 'resource', projects: 'example.sales.region' },
  });
  expect(await ids('assistant')).toEqual([
    'project-1',
    'project-2',
    'project-3',
  ]);
  expect(
    (
      await fixture.request('assistant', 'sales/projects/project-1', {
        notes: 'Saved from UI grant',
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await fixture.request('assistant', 'sales/projects/project-2', {
        notes: 'Regional edit independently allows this row',
      })
    ).status,
  ).toBe(200);
  await authz.defaultAccess.set({
    resource: { type: 'database.collection', id: QUOTES },
    actions: [{ action: 'read', scope: { type: 'all' } }],
  });
  expect(await ids('assistant', 'quotes')).toEqual([
    'quote-1',
    'quote-2',
    'quote-3',
    'quote-5',
    'quote-6',
    'quote-7',
    'quote-history-1',
    'quote-history-2',
    'quote-history-3',
  ]);
});
it('keeps all-region read separate from engineer edit, including direct repository policies', async () => {
  await authz.permissionSets.create({
    key: 'extra-read',
    grants: [
      authz.resources.grant('example.sales.projects', {
        view: { projects: 'allRecords' },
      }),
    ],
  });
  await authz.permissionSets.assign({
    subject: { type: 'user', id: fixture.users.engineer },
    permissionSet: 'extra-read',
  });
  expect(await ids('engineer')).toEqual([
    'project-1',
    'project-2',
    'project-3',
  ]);
  expect(
    (
      await fixture.request('engineer', 'sales/projects/project-3', {
        notes: 'Cross-region',
      })
    ).status,
  ).toBe(403);
  const scope = authz.for({
    principal: { type: 'user', id: fixture.users.engineer },
  });
  const policy = await authz.db.policyFor(PROJECTS, scope);
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
      await fixture.request('engineer', 'sales/projects/project-2', {
        title: 'Revised project',
        notes: 'Qualified',
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await fixture.request('engineer', 'sales/projects/project-2', {
        ownerId: fixture.users.assistant,
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

it('seeds once without overwriting edited example records', async () => {
  const seed = (
    await import('../database/seeds/202609220002_sales_permissions.js')
  ).default;
  const connection = fixture.database.connection();
  await connection.query
    .updateTable(PROJECTS)
    .set({ notes: 'Keep this edit' })
    .where('id', '=', 'project-1')
    .execute();
  await seed.run({ query: connection.query, connection });
  expect(
    await connection.query.selectFrom(PROJECTS).select('id').execute(),
  ).toHaveLength(4);
  expect(
    (
      await connection.query
        .selectFrom(PROJECTS)
        .select('notes')
        .where('id', '=', 'project-1')
        .executeTakeFirst()
    )?.notes,
  ).toBe('Keep this edit');
});

it('does not combine broad note access with narrow title access into broad title edits', async () => {
  await authz.permissionSets.update('example-sales-assistant', {
    key: 'example-sales-assistant',
    grants: [
      authz.resources.grant('example.sales.projects', ['view']),
      authz.db.grant(PROJECTS, {
        update: { fields: { input: ['notes'] }, recordAccess: ['allRecords'] },
      }),
    ],
  });
  await authz.permissionSets.create({
    key: 'own-titles',
    grants: [
      authz.db.grant(PROJECTS, {
        update: {
          fields: { input: ['title'] },
          recordAccess: ['recordsIOwn'],
        },
      }),
    ],
  });
  await authz.permissionSets.assign({
    subject: { type: 'user', id: fixture.users.assistant },
    permissionSet: 'own-titles',
  });
  const policy = await authz.db.policyFor(
    PROJECTS,
    authz.for({ principal: { type: 'user', id: fixture.users.assistant } }),
  );
  await expect(
    fixture.database
      .repository(PROJECTS)
      .withPolicy(policy)
      .updateOne({
        filter: { id: 'project-2' },
        values: { title: 'Should be denied' },
      }),
  ).rejects.toThrow();
  await fixture.database
    .repository(PROJECTS)
    .withPolicy(policy)
    .updateOne({ filter: { id: 'project-1' }, values: { title: 'Own title' } });
});

it('creates and removes all example schema through the real migrator', async () => {
  const path = await import('node:path');
  const { ORDERS, MEMBERS } = await import('../catalog.js');
  const connection = fixture.database.connection();
  expect(await connection.collections.getPhysical(ORDERS)).toBeDefined();
  const migrator = fixture.database.createMigrator({
    directory: path.resolve(import.meta.dirname, '../database/migrations'),
    packageName: '@nocobase/app-plugin-authorization-example',
  });
  await migrator.rollback();
  for (const name of [
    MEMBERS,
    PROJECTS,
    QUOTES,
    ORDERS,
    'authorizationExampleTeams',
    'authorizationExampleTeamMembers',
  ])
    expect(await connection.collections.getPhysical(name)).toBeUndefined();
});

it('keeps two shared record lists on one operation separate through HTTP, storage and repository checks', async () => {
  await authz.permissionSets.update('example-sales-assistant', {
    key: 'example-sales-assistant',
    grants: [authz.resources.grant('example.sales.quotes', ['submit'])],
  });
  await authz.defaultAccess.delete('resource', 'example.sales.quotes');
  const response = await admin('sharing-rules', 'POST', {
    key: 'multi-table',
    resource: { type: 'resource', id: 'example.sales.quotes' },
    subjects: [{ type: 'user', id: fixture.users.assistant }],
    actions: [
      {
        action: 'submit',
        scopeKey: 'quotes',
        selection: { type: 'records', ids: ['quote-3'] },
      },
      {
        action: 'submit',
        scopeKey: 'projects',
        selection: { type: 'records', ids: ['project-2'] },
      },
    ],
  });
  expect(response.status).toBe(201);
  const saved = (await authz.sharingRules.get('multi-table'))!;
  expect(saved.actions).toEqual([
    {
      action: 'submit',
      scopeKey: 'quotes',
      selection: { type: 'records', ids: ['quote-3'] },
    },
    {
      action: 'submit',
      scopeKey: 'projects',
      selection: { type: 'records', ids: ['project-2'] },
    },
  ]);
  const scope = authz.for({
    principal: { type: 'user', id: fixture.users.assistant },
  });
  const projects = await fixture.database
    .repository(PROJECTS)
    .withPolicy(await authz.db.policyFor(PROJECTS, scope))
    .findMany();
  expect(projects.map((item) => item.id)).toEqual(['project-2']);
  const quotePolicy = await authz.db.policyFor(QUOTES, scope);
  await expect(
    fixture.database
      .repository(QUOTES)
      .withPolicy(quotePolicy)
      .updateOne({
        filter: { id: 'quote-2' },
        values: { status: 'submitted' },
      }),
  ).rejects.toThrow();
  await fixture.database
    .repository(QUOTES)
    .withPolicy(quotePolicy)
    .updateOne({ filter: { id: 'quote-3' }, values: { status: 'submitted' } });
  // The sharing rule cannot grant the separate edit feature or its amount field.
  expect(await scope.can({ resource: saved.resource, action: 'edit' })).toBe(
    false,
  );
  await expect(
    fixture.database
      .repository(QUOTES)
      .withPolicy(quotePolicy)
      .updateOne({ filter: { id: 'quote-3' }, values: { amount: 1 } }),
  ).rejects.toThrow();
  expect(
    (
      await admin('sharing-rules/multi-table', 'PUT', {
        ...saved,
        actions: saved.actions.slice(1),
      })
    ).status,
  ).toBe(200);
  expect((await authz.sharingRules.get('multi-table'))?.actions).toEqual(
    saved.actions.slice(1),
  );
});

it('applies defaults and restrictions to the selected business scope without expanding sibling scopes', async () => {
  await authz.permissionSets.update('example-sales-assistant', {
    key: 'example-sales-assistant',
    grants: [authz.resources.grant('example.sales.quotes', ['submit'])],
  });
  expect(
    (
      await admin('default-access', 'PUT', {
        resource: { type: 'resource', id: 'example.sales.quotes' },
        actions: [
          {
            action: 'submit',
            scopeKey: 'projects',
            scope: { type: 'ids', ids: ['project-2'] },
          },
          {
            action: 'submit',
            scopeKey: 'quotes',
            scope: { type: 'ids', ids: ['quote-1', 'quote-2'] },
          },
        ],
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await admin('restriction-rules', 'POST', {
        key: 'only-first-quote',
        resource: { type: 'resource', id: 'example.sales.quotes' },
        subjects: [{ type: 'user', id: fixture.users.assistant }],
        actions: [
          {
            action: 'submit',
            scopeKey: 'quotes',
            scope: { type: 'ids', ids: ['quote-1'] },
          },
        ],
      })
    ).status,
  ).toBe(201);
  const scope = authz.for({
    principal: { type: 'user', id: fixture.users.assistant },
  });
  const policy = await authz.db.policyFor(QUOTES, scope);
  await expect(
    fixture.database
      .repository(QUOTES)
      .withPolicy(policy)
      .updateOne({
        filter: { id: 'quote-2' },
        values: { status: 'submitted' },
      }),
  ).rejects.toThrow();
  await fixture.database
    .repository(QUOTES)
    .withPolicy(policy)
    .updateOne({ filter: { id: 'quote-1' }, values: { status: 'submitted' } });
  const projects = await fixture.database
    .repository(PROJECTS)
    .withPolicy(await authz.db.policyFor(PROJECTS, scope))
    .findMany();
  expect(projects.map((item) => item.id)).toEqual(['project-2']);
});

it('narrows business endpoints to their operation while generic data policies aggregate grants', async () => {
  await authz.defaultAccess.delete('resource', 'example.sales.quotes');
  await authz.permissionSets.update('example-sales-assistant', {
    key: 'example-sales-assistant',
    grants: [
      authz.resources.grant('example.sales.projects', {
        view: { projects: 'allRecords' },
      }),
      authz.resources.grant('example.sales.quotes', {
        submit: { quotes: 'allRecords', projects: 'recordsIOwn' },
      }),
    ],
  });
  const scope = authz.for({
    principal: { type: 'user', id: fixture.users.assistant },
  });
  const generic = await fixture.database
    .repository(PROJECTS)
    .withPolicy(await authz.db.policyFor(PROJECTS, scope))
    .findMany();
  expect(generic.map((item) => item.id).sort()).toEqual([
    'project-1',
    'project-2',
    'project-3',
  ]);
  expect(
    (await fixture.request('assistant', 'sales/quotes/quote-2/submit', {}))
      .status,
  ).toBe(403);
  expect(
    (await fixture.request('assistant', 'sales/quotes/quote-1/submit', {}))
      .status,
  ).toBe(200);
  const invalid = await admin(
    'permission-sets/example-sales-assistant',
    'PUT',
    {
      key: 'example-sales-assistant',
      grants: [
        {
          resource: { type: 'resource', id: 'example.sales.projects' },
          actions: [
            {
              action: 'view',
              policy: { type: 'resource', projects: 'unknown-policy' },
            },
          ],
        },
      ],
    },
  );
  expect(invalid.status).toBe(400);
});

it('presents only business groups and applicable global scopes consistently across management pages', async () => {
  for (const path of [
    'permission-sets',
    'default-access',
    'sharing-rules',
    'restriction-rules',
    'inspector',
  ]) {
    const options = (await (await admin(`${path}/options`)).json())
      .data as AuthorizationOptions<LocalizedText>;
    expect(options.resourceTypes.map((type) => type.value)).not.toContain(
      'page',
    );
    expect(options.resourceTypes.map((type) => type.value)).not.toContain(
      'database.collection',
    );
    expect(options.resourceGroups?.map((group) => group.value)).toEqual([
      'authorization',
      'example.sales',
      'example.delivery',
    ]);
    const project = options.resourceTypes
      .find((type) => type.value === 'resource')!
      .resources.find((item) => item.value === 'example.sales.projects')!;
    const choices = project
      .actionScopes!.view.fields[0].options.map((option) => option.value)
      .filter(Boolean);
    expect(choices).toEqual(
      project.ruleScopes!.find((scope) => scope.action === 'view')!.policies,
    );
    expect(choices).toContain('recordsIOwn');
    expect(choices).toContain('example.sales.public');
    expect(choices).toContain('customFilter');
    expect(choices).not.toContain('recordsICreated');
    expect(choices).not.toContain('example.sales.own');
  }
  const sets = (await (await admin('permission-sets')).json())
    .data as PermissionSet[];
  expect(
    sets.find((set) => set.key === 'example-sales-engineer')?.title,
  ).toMatchObject({
    key: 'roles.engineer',
    ns: '@nocobase/app-plugin-authorization-example',
  });
});

it('explains a business action with its granting permission set and branch sharing and restriction rules', async () => {
  const response = await admin('inspect', 'POST', {
    subject: { type: 'user', id: fixture.users.assistant },
    resource: { type: 'resource', id: 'example.sales.projects' },
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
        code: 'SCOPE_EXPANDED',
        details: expect.objectContaining({
          source: expect.objectContaining({ plugin: 'sharing-rules' }),
        }),
      }),
      expect.objectContaining({
        code: 'SCOPE_RESTRICTED',
        details: expect.objectContaining({
          source: expect.objectContaining({ plugin: 'restriction-rules' }),
        }),
      }),
    ]),
  );
});

it('persists localized titles through permission-set and rule HTTP edits', async () => {
  const title = {
    key: 'roles.assistant',
    ns: '@nocobase/app-plugin-authorization-example',
  };
  const cases = [
    { path: 'permission-sets', input: { key: 'localized-title', grants: [] } },
    {
      path: 'sharing-rules',
      input: {
        key: 'localized-title',
        resource: { type: 'resource', id: 'example.sales.projects' },
        subjects: [{ type: 'user', id: fixture.users.assistant }],
        actions: [
          {
            action: 'view',
            scopeKey: 'projects',
            selection: { type: 'records', ids: ['project-1'] },
          },
        ],
      },
    },
    {
      path: 'restriction-rules',
      input: {
        key: 'localized-title',
        resource: { type: 'resource', id: 'example.sales.projects' },
        subjects: [{ type: 'user', id: fixture.users.assistant }],
        actions: [
          { action: 'view', scopeKey: 'projects', scope: { type: 'all' } },
        ],
      },
    },
  ];
  for (const { path, input } of cases) {
    const created = await admin(path, 'POST', { ...input, title });
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({ data: { title } });
    const saved = await admin(path);
    expect(saved.status).toBe(200);
    const record = (await saved.json()).data.find(
      (item: { key: string }) => item.key === 'localized-title',
    );
    const updated = await admin(`${path}/localized-title`, 'PUT', record);
    expect(updated.status).toBe(200);
    expect(await updated.json()).toMatchObject({ data: { title } });
    const renamed = await admin(`${path}/localized-title`, 'PUT', {
      ...record,
      title: 'My custom title',
    });
    expect(renamed.status).toBe(200);
    expect(await (await admin(path)).json()).toMatchObject({
      data: expect.arrayContaining([
        expect.objectContaining({
          key: 'localized-title',
          title: 'My custom title',
        }),
      ]),
    });
    expect(
      (
        await admin(path, 'POST', {
          ...input,
          key: 'invalid-title',
          title: { key: 'missing-namespace' },
        })
      ).status,
    ).toBe(400);
  }
});

it('returns executable policies for both submit targets without a second policy lookup', async () => {
  const policyLookup = vi
    .spyOn(authz.db, 'policyFor')
    .mockRejectedValue(new Error('Unexpected second authorization'));
  try {
    const scope = authz.for({
      principal: { type: 'user', id: fixture.users.engineer },
    });
    const request = {
      resource: { type: 'resource' as const, id: 'example.sales.quotes' },
      action: 'submit',
    };
    const decision = await scope.authorize(request);
    expect(decision.effect).toBe('conditional');
    expect(decision.conditions?.type).toBe('resource');
    expect(Object.keys(decision.conditions!.database!)).toEqual(
      expect.arrayContaining([PROJECTS, QUOTES]),
    );
    const quotes = decision.conditions!.database![QUOTES];
    const projects = decision.conditions!.database![PROJECTS];
    expect(quotes).toMatchObject({
      create: false,
      delete: false,
      update: { fields: ['status'] },
    });
    expect(projects).toMatchObject({
      create: false,
      update: false,
      delete: false,
    });
    // The separately granted quote-edit action must not add amount writes to submit.
    await expect(
      fixture.database
        .repository(QUOTES)
        .withPolicy(quotes)
        .updateOne({ filter: { id: 'quote-2' }, values: { amount: 1 } }),
    ).rejects.toMatchObject({ code: 'FIELD_WRITE_FORBIDDEN' });
    // A boolean check is only feature visibility, never evidence that row conditions ran.
    expect(await scope.can(request)).toBe(true);
    await expect(scope.require(request)).rejects.toBeInstanceOf(Error);
    expect(
      (await fixture.request('engineer', 'sales/quotes/quote-2/submit', {}))
        .status,
    ).toBe(200);
    expect(policyLookup).not.toHaveBeenCalled();
  } finally {
    policyLookup.mockRestore();
  }
});

it('fails closed for ungranted or unknown composed operations, including root typos', async () => {
  const assistant = authz.for({
    principal: { type: 'user', id: fixture.users.assistant },
  });
  const denied = await assistant.authorize({
    resource: { type: 'resource', id: 'example.sales.quotes' },
    action: 'submit',
  });
  expect(denied.effect).toBe('deny');
  expect(denied.conditions).toBeUndefined();
  const root = authz.for({
    principal: { type: 'user', id: fixture.users.admin },
  });
  expect(
    (
      await root.authorize({
        resource: { type: 'resource', id: 'example.sales.quotes' },
        action: 'typo',
      })
    ).effect,
  ).toBe('deny');
  const decision = await root.authorize({
    resource: { type: 'resource', id: 'example.sales.quotes' },
    action: 'submit',
  });
  expect(decision.conditions?.database?.[PROJECTS]).toEqual({
    read: true,
    create: false,
    update: false,
    delete: false,
  });
  expect(decision.conditions?.database?.[QUOTES]).toEqual({
    read: true,
    create: false,
    update: true,
    delete: false,
  });
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

it('inherits roles and shared records from teams, and revokes them on membership removal', async () => {
  expect(
    (await fixture.request('proposal', 'sales/quotes/quote-7/submit', {}))
      .status,
  ).toBe(200);
  expect(
    (await fixture.request('proposal', 'sales/quotes/quote-5/submit', {}))
      .status,
  ).toBe(403);
  expect(
    (await fixture.request('proposal', 'sales/quotes/quote-4/submit', {}))
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
  await fixture.database
    .connection()
    .query.deleteFrom('authorizationExampleTeamMembers')
    .where('userId', '=', fixture.users.proposal)
    .execute();
  expect((await fixture.request('proposal', 'sales/quotes')).status).toBe(403);
  expect((await fixture.request('engineer', 'sales/quotes')).status).toBe(200);
});

it('combines direct and inherited roles without removing direct access when a team is disabled', async () => {
  const data = (await (await fixture.request('coordinator', 'context')).json())
    .data;
  expect(data.roles.map((role: { key: string }) => role.key)).toEqual(
    expect.arrayContaining(['example-sales-manager', 'example-sales-engineer']),
  );
  await fixture.database
    .connection()
    .query.updateTable('authorizationExampleTeams')
    .set({ active: false })
    .where('id', '=', 'proposal')
    .execute();
  const after = (await (await fixture.request('coordinator', 'context')).json())
    .data;
  expect(after.roles.map((role: { key: string }) => role.key)).toContain(
    'example-sales-manager',
  );
  expect(after.roles.map((role: { key: string }) => role.key)).not.toContain(
    'example-sales-engineer',
  );
  expect((await fixture.request('coordinator', 'sales/projects')).status).toBe(
    200,
  );
  expect((await fixture.request('proposal', 'sales/projects')).status).toBe(
    403,
  );
});

it('uses team subjects in pickers and inspects a user with the same memberships as live requests', async () => {
  const list = await admin('permission-sets/subjects/example.sales.team');
  expect(list.status).toBe(200);
  expect((await list.json()).data.items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: 'proposal' }),
      expect.objectContaining({ id: 'delivery' }),
    ]),
  );
  const response = await admin('inspect', 'POST', {
    subject: { type: 'user', id: fixture.users.proposal },
    resource: { type: 'resource', id: 'example.sales.quotes' },
    action: 'submit',
  });
  expect(response.status).toBe(200);
  const decision = (await response.json()).data;
  expect(decision.effect).toBe('conditional');
  expect(decision.reasons).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        code: 'SCOPE_EXPANDED',
        details: expect.objectContaining({
          source: expect.objectContaining({ plugin: 'sharing-rules' }),
        }),
      }),
      expect.objectContaining({ code: 'SCOPE_RESTRICTED' }),
    ]),
  );
  expect((await fixture.request('dispatch', 'sales/projects')).status).toBe(
    403,
  );
  expect(await ids('dispatch', 'orders')).toEqual(['order-1', 'order-2']);
});

it('does not let team sharing grant an operation after the team role is unassigned', async () => {
  await fixture.database
    .connection()
    .query.deleteFrom('authorizationPermissionSetAssignments')
    .where('subjectType', '=', 'example.sales.team')
    .where('subjectId', '=', 'proposal')
    .execute();
  expect(
    (await fixture.request('proposal', 'sales/quotes/quote-7/submit', {}))
      .status,
  ).toBe(403);
});

it('keeps four distinct job roles and restores direct-only duties after team removal', async () => {
  const sets = (await authz.permissionSets.list()).filter((set) =>
    set.key.startsWith('example-sales-'),
  );
  expect(sets).toHaveLength(4);
  expect(
    (await fixture.request('manager', 'sales/quotes/quote-3/submit', {}))
      .status,
  ).toBe(403);
  expect(
    (await fixture.request('coordinator', 'sales/quotes/quote-7/submit', {}))
      .status,
  ).toBe(200);
  await fixture.database
    .connection()
    .query.deleteFrom('authorizationExampleTeamMembers')
    .where('userId', '=', fixture.users.coordinator)
    .execute();
  expect(
    (await fixture.request('coordinator', 'sales/quotes/quote-7/submit', {}))
      .status,
  ).toBe(403);
  expect((await fixture.request('coordinator', 'sales/projects')).status).toBe(
    200,
  );
});

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

it('only lets administrators restore practice records and preserves authorization edits', async () => {
  expect(
    (
      await fixture.router.request('/api/authorization-example/reset', {
        method: 'POST',
      })
    ).status,
  ).toBe(401);
  expect(
    (await (await fixture.request('engineer', 'context')).json()).data.canReset,
  ).toBe(false);
  expect(
    (await (await fixture.request('admin', 'context')).json()).data.canReset,
  ).toBe(true);
  expect(
    (await fixture.request('engineer', 'sales/quotes/quote-2/submit', {}))
      .status,
  ).toBe(200);
  expect(
    (
      await fixture.request('delivery', 'sales/orders/order-2/deliver', {
        deliveryReference: 'DONE',
      })
    ).status,
  ).toBe(200);
  expect((await fixture.request('engineer', 'reset', {})).status).toBe(403);
  const query = fixture.database.connection().query;
  await query
    .deleteFrom('authorizationExampleTeamMembers')
    .where('userId', '=', fixture.users.proposal)
    .execute();
  for (let attempt = 0; attempt < 2; attempt++) {
    expect((await fixture.request('admin', 'reset', {})).status).toBe(200);
    expect(
      await query
        .selectFrom(QUOTES)
        .selectAll()
        .where('id', '=', 'quote-2')
        .executeTakeFirst(),
    ).toMatchObject({ status: 'draft', amount: 12000 });
    expect(
      await query
        .selectFrom('authorizationExampleOrders')
        .selectAll()
        .where('id', '=', 'order-2')
        .executeTakeFirst(),
    ).toMatchObject({
      status: 'ready',
      deliveryReference: '',
      quoteId: 'quote-history-2',
    });
    expect(
      await query
        .selectFrom(QUOTES)
        .selectAll()
        .where('id', '=', 'quote-history-2')
        .executeTakeFirst(),
    ).toMatchObject({ status: 'accepted' });
    expect((await fixture.request('proposal', 'sales/quotes')).status).toBe(
      403,
    );
  }
  expect(
    (await fixture.request('engineer', 'sales/quotes/quote-2/submit', {}))
      .status,
  ).toBe(200);
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
