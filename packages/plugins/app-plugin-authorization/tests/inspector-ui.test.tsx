import { selectOption } from './select-option.js';
// @vitest-environment jsdom
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from '@testing-library/react';
import type { AppClientRegisteredRoute } from '@nocobase/app-client/plugins';
import { MemoryRouter } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';
import type {
  AuthorizationInspection,
  AuthorizationOptions,
} from '../client/authorization-client.js';
const mocks = vi.hoisted(() => ({
  routes: [] as AppClientRegisteredRoute[],
  loadOptions: vi.fn(),
  listSubjects: vi.fn(),
  resolveSubjects: vi.fn(),
  inspectBatch: vi.fn(),
  inspectConfigured: vi.fn(),
}));
vi.mock('@nocobase/app-client', () => ({
  useClientApplication: () => ({ runtime: { routes: mocks.routes } }),
}));
vi.mock('../client/runtime.js', () => ({
  getAuthorizationClient: () => mocks,
}));
vi.mock('@nocobase/i18n/client', async () => {
  const { translate } = await import('./locale-harness.js');
  return { useTranslation: () => ({ t: translate }) };
});
import InspectorPage from '../client/pages/inspector-page.js';
import { inspectionStatus } from '../client/pages/inspector-status.js';
import en from '../client/locales/en-US.js';
const options: AuthorizationOptions = {
  plugins: [],
  subjectTypes: [
    { value: 'user', label: 'Users', selection: { type: 'collection' } },
    {
      value: 'department',
      label: 'Departments',
      selection: { type: 'collection' },
    },
    {
      value: 'authenticated',
      label: 'All signed-in users',
      selection: { type: 'fixed', id: '*' },
    },
  ],
  recordAccessPolicies: [],
  collections: [{ name: 'orders0', fields: ['id', 'title'] }],
  resourceTypes: [
    {
      value: 'database.collection',
      label: 'Data tables',
      groups: [{ value: 'sales', label: 'Sales' }],
      actions: [
        { value: 'read', label: 'Read' },
        { value: 'update', label: 'Update' },
      ],
      resources: Array.from({ length: 25 }, (_, i) => ({
        value: `orders${i}`,
        label: `Orders ${i}`,
        group: 'sales',
      })),
    },
  ],
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.routes = [];
  mocks.loadOptions.mockResolvedValue(options);
  mocks.inspectConfigured.mockResolvedValue({
    unrestricted: false,
    types: ['database.collection'],
    resources: [{ type: 'database.collection', id: 'orders24' }],
  });
  mocks.listSubjects.mockResolvedValue({
    items: [{ id: 'alice', title: 'Alice' }],
    total: 1,
  });
  mocks.resolveSubjects.mockResolvedValue([{ id: 'alice', title: 'Alice' }]);
  mocks.inspectBatch.mockImplementation(
    (_subject: unknown, checks: Omit<AuthorizationInspection, 'decision'>[]) =>
      Promise.resolve(
        checks.map((check) => ({
          ...check,
          decision: {
            effect: 'conditional',
            conditions: {
              type: 'database',
              scope: true,
              fields: ['id', 'title'],
            },
            reasons: [
              { code: 'GRANT_MATCHED', message: 'Sales team grants access' },
            ],
          },
        })),
      ),
  );
});
function mount(url = '/?user=alice') {
  render(
    <MemoryRouter initialEntries={[url]}>
      <InspectorPage />
    </MemoryRouter>,
  );
}
it('waits for a person before computing access', async () => {
  mount('/');
  expect(await screen.findByText(en.inspector.empty)).toBeInTheDocument();
  expect(mocks.inspectBatch).not.toHaveBeenCalled();
});
it('batches only the current page, supports group collapse and shows readable scope details', async () => {
  mount();
  const cell = await screen.findByRole('button', { name: 'Orders 0: Read' });
  expect(mocks.inspectBatch.mock.calls[0]?.[1]).toHaveLength(40);
  expect(screen.queryByText('Orders 20')).not.toBeInTheDocument();
  fireEvent.click(cell);
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(
    screen.getByText(en.inspector.reasonCodes.GRANT_MATCHED),
  ).toBeInTheDocument();
  expect(screen.getByText(en.labels.allRecords)).toBeInTheDocument();
  expect(
    screen.getByRole('textbox', { name: en.inspector.fieldSearch }),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: en.common.close }));
  fireEvent.click(screen.getByRole('button', { name: 'Sales' }));
  expect(screen.queryByText('Orders 0')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Sales' }));
  const next = screen.getAllByRole('button', { name: en.subjects.next });
  fireEvent.click(next[next.length - 1]!);
  await screen.findByRole('button', { name: 'Orders 20: Read' });
  expect(mocks.inspectBatch.mock.calls[1]?.[1]).toHaveLength(10);
});
it('renders failed calculations separately from denied access', () => {
  expect(
    inspectionStatus({
      effect: 'deny',
      reasons: [{ code: 'AUTHORIZATION_HANDLER_FAILED', message: 'failed' }],
    }),
  ).toBe('error');
  expect(inspectionStatus({ effect: 'deny', reasons: [] })).toBe('none');
  expect(
    inspectionStatus(
      {
        effect: 'conditional',
        reasons: [],
        conditions: { type: 'database', scope: true, fields: ['id'] },
      },
      ['id'],
    ),
  ).toBe('all');
  expect(
    inspectionStatus(
      {
        effect: 'conditional',
        reasons: [],
        conditions: { type: 'database', scope: true, fields: ['id'] },
      },
      ['id', 'title'],
    ),
  ).toBe('scoped');
});
it('ignores stale responses after changing resource search', async () => {
  let resolve!: (result: readonly AuthorizationInspection[]) => void;
  mocks.inspectBatch.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  mount();
  const search = await screen.findByRole('textbox', {
    name: en.permissionSets.picker.searchResources,
  });
  await waitFor(() => expect(mocks.inspectBatch).toHaveBeenCalledOnce());
  fireEvent.change(search, { target: { value: 'Orders 24' } });
  await screen.findByRole('button', { name: 'Orders 24: Read' });
  resolve([]);
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Orders 24: Read' }),
    ).toBeInTheDocument(),
  );
});

it('defaults to the first populated type when pages have no registered resources', async () => {
  mocks.loadOptions.mockResolvedValue({
    ...options,
    resourceTypes: [
      {
        value: 'page',
        label: 'Pages',
        resources: [],
        actions: [{ value: 'access', label: 'Access' }],
      },
      ...options.resourceTypes,
    ],
  });
  mount();
  expect(
    await screen.findByRole('button', { name: 'Orders 0: Read' }),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Pages' }));
  expect(
    await screen.findByText(en.inspector.noRegisteredResources),
  ).toBeInTheDocument();
});

it('clamps stale page numbers and resets search when switching resource types', async () => {
  mocks.loadOptions.mockResolvedValue({
    ...options,
    resourceTypes: [
      ...options.resourceTypes,
      {
        value: 'settings',
        label: 'Settings',
        resources: [{ value: 'authorization', label: 'Authorization' }],
        actions: [{ value: 'read', label: 'Read' }],
      },
    ],
  });
  mount('/?user=alice&page=999&search=Orders');
  expect(
    await screen.findByRole('button', { name: 'Orders 24: Read' }),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
  expect(
    await screen.findByRole('button', { name: 'Authorization: Read' }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('textbox', {
      name: en.permissionSets.picker.searchResources,
    }),
  ).toHaveValue('');
});

it('includes client-registered pages and their groups in the inspection batch', async () => {
  mocks.routes = [
    {
      name: 'business',
      packageName: '@test/pages',
      navigation: { title: 'Business' },
      children: [
        {
          name: 'customers',
          packageName: '@test/pages',
          auth: 'required',
          componentLoader: async () => ({ default: () => null }),
          navigation: { title: 'Customers' },
        },
      ],
    },
  ] as AppClientRegisteredRoute[];
  mocks.loadOptions.mockResolvedValue({
    ...options,
    resourceTypes: [
      {
        value: 'page',
        label: 'Pages',
        resources: [],
        actions: [{ value: 'access', label: 'Access' }],
      },
      ...options.resourceTypes,
    ],
  });
  mount('/?user=alice&type=page');
  expect(
    await screen.findByRole('button', { name: 'Customers: Access' }),
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Business' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  expect(mocks.inspectBatch).toHaveBeenCalledWith(
    { type: 'user', id: 'alice' },
    [{ resource: { type: 'page', id: 'customers' }, action: 'access' }],
  );
  expect(
    screen.queryByText(en.inspector.noRegisteredResources),
  ).not.toBeInTheDocument();
});

it('selects a registered department and a fixed subject without treating either as a user', async () => {
  mocks.listSubjects.mockImplementation((_settings: string, type: string) =>
    Promise.resolve({
      items: [
        {
          id: 'sales',
          title: type === 'department' ? 'Sales department' : 'Alice',
        },
      ],
      total: 1,
    }),
  );
  mocks.resolveSubjects.mockResolvedValue([
    { id: 'sales', title: 'Sales department' },
  ]);
  mount('/');
  await selectOption(
    await screen.findByRole('combobox', { name: en.inspector.subjectType }),
    'Departments',
  );
  await waitFor(() =>
    expect(mocks.listSubjects).toHaveBeenCalledWith(
      'inspector',
      'department',
      expect.objectContaining({ page: 1 }),
    ),
  );
  await selectOption(
    screen.getByRole('combobox', { name: en.inspector.subject }),
    'Sales department',
  );
  await waitFor(() =>
    expect(mocks.inspectBatch).toHaveBeenCalledWith(
      { type: 'department', id: 'sales' },
      expect.any(Array),
    ),
  );
  await selectOption(
    screen.getByRole('combobox', { name: en.inspector.subjectType }),
    'All signed-in users',
  );
  await waitFor(() =>
    expect(mocks.inspectBatch).toHaveBeenLastCalledWith(
      { type: 'authenticated', id: '*' },
      expect.any(Array),
    ),
  );
  expect(
    screen.queryByRole('combobox', { name: en.inspector.subject }),
  ).not.toBeInTheDocument();
});

it('does not present user-dependent subject scopes as a denial', () => {
  expect(
    inspectionStatus({
      effect: 'deny',
      reasons: [
        { code: 'USER_CONTEXT_REQUIRED', message: 'User context required' },
      ],
    }),
  ).toBe('context');
});

it('marks configured resource types without showing counts or relying on the current results page', async () => {
  mocks.loadOptions.mockResolvedValue({
    ...options,
    resourceTypes: [
      ...options.resourceTypes,
      { value: 'settings', label: 'Settings', resources: [], actions: [] },
    ],
  });
  mocks.inspectConfigured.mockResolvedValue({
    unrestricted: false,
    types: ['settings'],
  });
  mount();
  const settings = await screen.findByRole('button', { name: 'Settings' });
  await waitFor(() =>
    expect(
      within(settings).getByRole('img', {
        name: en.permissionWorkspace.configured,
      }),
    ).toBeInTheDocument(),
  );
  const tables = screen.getByRole('button', { name: 'Data tables' });
  expect(within(tables).queryByRole('img')).not.toBeInTheDocument();
  expect(tables).not.toHaveTextContent('25');
});

it('filters configured resources before pagination and preserves action columns', async () => {
  mount('/?user=alice&page=2');
  await screen.findByRole('button', { name: 'Orders 24: Read' });
  fireEvent.click(
    screen.getByRole('checkbox', {
      name: en.permissionWorkspace.configuredOnly,
    }),
  );
  await waitFor(() => expect(screen.getByText('1 / 1')).toBeVisible());
  expect(screen.getByText('Orders 24')).toBeVisible();
  expect(screen.queryByText('Orders 20')).toBeNull();
  expect(screen.queryByRole('columnheader', { name: 'Read' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Orders 24: Read' })).toBeVisible();
  fireEvent.change(
    screen.getByRole('textbox', {
      name: en.permissionSets.picker.searchResources,
    }),
    { target: { value: 'missing' } },
  );
  expect(await screen.findByText(en.inspector.noResources)).toBeVisible();
});

it.each([
  { unrestricted: true, types: [], resources: [] },
  {
    unrestricted: false,
    types: ['database.collection'],
    resources: [{ type: 'database.collection', id: '*' }],
  },
])(
  'keeps all resources for unrestricted or wildcard configuration: %j',
  async (configured) => {
    mocks.inspectConfigured.mockResolvedValue(configured);
    mount('/?user=alice&configuredOnly=true');
    expect(
      await screen.findByRole('button', { name: 'Orders 0: Read' }),
    ).toBeVisible();
    expect(screen.getByText('1 / 2')).toBeVisible();
  },
);

it('explains business access once and keeps page checks and JSON in one collapsed technical section', async () => {
  const grant = {
    code: 'GRANT_MATCHED',
    message: 'raw grant',
    plugin: 'resource',
    details: {
      source: {
        plugin: 'permission-sets',
        id: 'sales-assistant',
        title: 'Sales assistant',
      },
    },
  };
  const database = {
    effect: 'conditional' as const,
    conditions: {
      type: 'database',
      action: 'read',
      scope: true,
      fields: ['id'],
    },
    reasons: [
      grant,
      {
        code: 'SCOPE_EXPANDED',
        message: 'raw scope',
        details: {
          source: { plugin: 'default-access', id: 'resource:quotes' },
          scope: { type: 'database', recordAccess: 'own' },
        },
      },
      {
        code: 'SCOPE_RESTRICTED',
        message: 'raw restriction',
        details: {
          source: { plugin: 'restriction-rules', id: 'private-internal-key' },
          scope: { type: 'database', recordAccess: 'public' },
        },
      },
    ],
  };
  mocks.loadOptions.mockResolvedValue({
    ...options,
    recordAccessPolicies: [
      { value: 'own', label: 'Projects owned by me' },
      { value: 'public', label: 'Non-confidential projects' },
    ],
    resourceTypes: [
      {
        value: 'resource',
        label: 'Business',
        actions: [{ value: 'view', label: 'View' }],
        resources: [
          {
            value: 'quotes',
            label: 'Quotes',
            ruleScopes: [
              {
                action: 'view',
                scopeKey: 'quotes',
                collection: 'quotesTable',
                label: 'Quotes',
              },
            ],
          },
        ],
      },
    ],
  });
  mocks.inspectBatch.mockImplementation(
    (_subject, checks: Omit<AuthorizationInspection, 'decision'>[]) =>
      Promise.resolve(
        checks.map((check) => ({
          ...check,
          decision: {
            effect: 'conditional',
            conditions: { type: 'resource' },
            reasons: [
              grant,
              {
                ...grant,
                plugin: 'database',
                details: {
                  source: grant.details.source,
                  policy: { scopes: { quotes: 'own' } },
                },
              },
              ...database.reasons.slice(1),
              { code: 'PAGE_ACCESS_GRANTED', message: 'raw page access' },
            ],
            checks: [
              {
                resource: { type: 'page', id: 'quotesPage' },
                action: 'access',
                decision: { effect: 'permit', reasons: [] },
              },
              {
                resource: { type: 'database.collection', id: 'quotesTable' },
                action: 'read',
                decision: database,
              },
            ],
          },
        })),
      ),
  );
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Quotes: View' }));
  expect(await screen.findByText('Users · Alice')).toBeVisible();
  expect(screen.getByText('Sales assistant')).toBeVisible();
  expect(
    screen.getAllByText(en.inspector.reasonCodes.GRANT_MATCHED, {
      exact: false,
    }),
  ).toHaveLength(1);
  expect(screen.getByText('Projects owned by me')).toBeVisible();
  expect(screen.getByText('Non-confidential projects')).toBeVisible();
  expect(screen.getByText(en.inspector.summary.scoped)).toBeVisible();
  expect(screen.getAllByText(en.inspector.technicalDetails)).toHaveLength(1);
  expect(screen.queryByText('quotesPage · access')).not.toBeInTheDocument();
  const raw = screen.getByText(/"private-internal-key"/);
  expect(raw).not.toBeVisible();
  fireEvent.click(screen.getByText(en.inspector.technicalDetails));
  expect(raw).toBeVisible();
});

it('renders an unregistered plugin explanation and source title without assuming other plugins participated', async () => {
  const { Decision } = await import('../client/pages/inspector-decision.js');
  render(
    <Decision
      fields={[]}
      value={{
        effect: 'permit',
        reasons: [
          {
            code: 'PROJECT_MEMBERSHIP_CONFIRMED',
            message: 'Project membership permits access.',
            plugin: 'custom-membership',
            details: {
              source: {
                plugin: 'custom-membership',
                id: 'internal-team-id',
                title: 'Project team',
              },
            },
          },
        ],
      }}
    />,
  );
  expect(screen.getByText('Project membership permits access.')).toBeVisible();
  expect(screen.getByText('Project team')).toBeVisible();
  expect(
    screen.queryByText(/default access|sharing|restriction/i),
  ).not.toBeInTheDocument();
});

it('shows a team grant once despite different underlying policies and retains the user-context explanation', async () => {
  const { Decision } = await import('../client/pages/inspector-decision.js');
  const source = {
    plugin: 'permission-sets',
    id: 'engineer',
    title: 'Sales engineer',
  };
  const grant = {
    code: 'GRANT_MATCHED',
    message: 'business grant',
    details: { source, policy: { scopes: { quotes: 'preparedByMe' } } },
  };
  const databaseGrant = {
    code: 'GRANT_MATCHED',
    message: 'table grant',
    details: { source },
  };
  const context = {
    code: 'USER_CONTEXT_REQUIRED',
    message: 'User context required',
  };
  render(
    <Decision
      fields={[]}
      value={{
        effect: 'deny',
        reasons: [grant, context, databaseGrant],
        checks: [
          {
            resource: { type: 'database.collection', id: 'quotes' },
            action: 'read',
            decision: { effect: 'deny', reasons: [context, databaseGrant] },
          },
        ],
      }}
    />,
  );
  expect(screen.getAllByText('Sales engineer')).toHaveLength(1);
  expect(
    screen.getAllByText(en.inspector.reasonCodes.USER_CONTEXT_REQUIRED),
  ).toHaveLength(1);
  expect(screen.queryByText(en.inspector.summary.none)).not.toBeInTheDocument();
});
