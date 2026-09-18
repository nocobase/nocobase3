vi.mock('../../app-plugin-authz-restriction-rules/client/api.js', () => ({
  useRestrictionRulesClient: () => authz,
}));
vi.mock('../../app-plugin-authz-sharing-rules/client/api.js', () => ({
  useSharingRulesClient: () => authz,
}));
vi.mock('../../app-plugin-authz-default-access/client/api.js', () => ({
  useDefaultAccessClient: () => authz,
}));
import { selectOption } from './select-option.js';
// @vitest-environment jsdom
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';
import type { AuthorizationOptions } from '../client/authorization-client.js';
const authz = vi.hoisted(() => ({
  can: vi.fn(async () => true),
  getPermissionsRevision: () => 0,
  onPermissionsInvalidated: vi.fn(() => () => {}),
  listDefaultAccess: vi.fn(),
  listDefaultAccessRecords: vi.fn(),
  setDefaultAccess: vi.fn(),
  listRestrictionRules: vi.fn(),
  listRestrictionRecords: vi.fn(),
  listSharingRules: vi.fn(),
  listSharingRecords: vi.fn(),
}));
vi.mock('../client/use-authorization-client.js', () => ({
  useAuthorizationClient: () => authz,
}));
vi.mock('@nocobase/i18n/client', async () => {
  const { translate } = await import('./locale-harness.js');
  return { useTranslation: () => ({ t: translate }) };
});
import { DefaultAccessPanel } from '../../app-plugin-authz-default-access/client/pages/default-access-panel.js';
import { RestrictionRulesPanel } from '../../app-plugin-authz-restriction-rules/client/pages/restriction-rules-panel.js';
import { SharingRulesPanel } from '../../app-plugin-authz-sharing-rules/client/pages/sharing-rules-panel.js';
import en from './rule-locales.js';
const resource = { type: 'database.collection', id: 'orders' };
const options: AuthorizationOptions = {
  plugins: [],
  subjectTypes: [],
  collections: [{ name: 'orders', fields: ['id', 'name'] }],
  recordAccessPolicies: [],
  resourceTypes: [
    {
      value: resource.type,
      label: 'Tables',
      resources: [
        {
          value: 'orders',
          label: 'Orders',
          actions: [{ value: 'read', label: 'Read' }],
        },
      ],
      actions: [
        { value: 'read', label: 'Read' },
        { value: 'update', label: 'Update' },
      ],
    },
  ],
};
function Location() {
  return <output data-testid='location'>{useLocation().search}</output>;
}
beforeEach(() => {
  vi.resetAllMocks();
  authz.listDefaultAccess.mockResolvedValue([]);
  authz.listDefaultAccessRecords.mockResolvedValue([]);
  authz.setDefaultAccess.mockResolvedValue(undefined);
  authz.listRestrictionRecords.mockResolvedValue([]);
  authz.listSharingRecords.mockResolvedValue([]);
});
it('saves simple scopes inline without opening a dialog', async () => {
  render(
    <MemoryRouter>
      <DefaultAccessPanel options={options} />
    </MemoryRouter>,
  );
  const cell = screen.getByRole('button', { name: 'Orders: Read' });
  await waitFor(() => expect(cell).toBeEnabled());
  expect(screen.queryByRole('button', { name: 'Orders: Update' })).toBeNull();
  fireEvent.click(cell);
  fireEvent.click(
    await screen.findByRole('menuitem', { name: en.labels.allRecords }),
  );
  await waitFor(() =>
    expect(authz.setDefaultAccess).toHaveBeenCalledWith({
      resource,
      actions: [{ action: 'read', scope: { type: 'all' } }],
    }),
  );
  expect(screen.queryByRole('dialog')).toBeNull();
});
it('opens a drawer and preserves search and page on close', async () => {
  render(
    <MemoryRouter initialEntries={['/?search=Orders&page=2']}>
      <DefaultAccessPanel options={options} />
      <Location />
    </MemoryRouter>,
  );
  const cell = screen.getByRole('button', { name: 'Orders: Read' });
  await waitFor(() => expect(cell).toBeEnabled());
  fireEvent.click(cell);
  fireEvent.click(
    await screen.findByRole('menuitem', { name: en.defaultAccess.customScope }),
  );
  const scope = await screen.findByRole('combobox', { name: 'Read' });
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  await selectOption(scope, en.labels.allRecords);
  fireEvent.click(screen.getByRole('button', { name: en.common.close }));
  expect(
    await screen.findByText(en.permissionWorkspace.discardBody),
  ).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole('button', { name: en.permissionWorkspace.discard }),
  );
  await waitFor(() =>
    expect(screen.getByTestId('location')).toHaveTextContent(
      '?search=Orders&page=2',
    ),
  );
  expect(authz.setDefaultAccess).not.toHaveBeenCalled();
});
it.each(['sharing', 'restriction'] as const)(
  'restores a %s rule from the URL with all editor sections visible',
  async (kind) => {
    const base = {
      key: 'rule-1',
      title: 'Example',
      resource,
      subjects: [{ type: 'authenticated', id: '*' }],
    };
    authz.listSharingRules.mockResolvedValue([
      {
        ...base,
        actions: [
          { action: 'read', selection: { type: 'records', ids: ['1'] } },
        ],
      },
    ]);
    authz.listRestrictionRules.mockResolvedValue([
      { ...base, actions: [{ action: 'read', scope: { type: 'all' } }] },
    ]);
    const Panel =
      kind === 'sharing' ? SharingRulesPanel : RestrictionRulesPanel;
    const labels = kind === 'sharing' ? en.sharingRules : en.restrictionRules;
    render(
      <MemoryRouter initialEntries={['/?rule=rule-1']}>
        <Panel options={options} />
      </MemoryRouter>,
    );
    const drawer = await screen.findByRole('dialog');
    expect(
      within(drawer)
        .getAllByRole('heading', { level: 3 })
        .map((node) => node.textContent),
    ).toEqual([
      labels.ruleHeading,
      labels.assignmentsHeading,
      labels.accessHeading,
    ]);
    for (const name of [
      labels.ruleHeading,
      labels.accessHeading,
      labels.assignmentsHeading,
    ]) {
      expect(
        within(drawer).getByRole('heading', { name, level: 3 }),
      ).toBeInTheDocument();
    }
  },
);

it('groups resources in the table and filters configured resources', async () => {
  authz.listDefaultAccess.mockResolvedValue([
    { resource, actions: [{ action: 'read', scope: { type: 'all' } }] },
  ]);
  const grouped: AuthorizationOptions = {
    ...options,
    resourceTypes: [
      {
        ...options.resourceTypes[0]!,
        groups: [
          {
            value: 'business',
            label: 'Business',
            children: [{ value: 'sales', label: 'Sales' }],
          },
        ],
        resources: [
          { value: 'orders', label: 'Orders', group: 'sales' },
          { value: 'notes', label: 'Notes' },
        ],
      },
    ],
  };
  render(
    <MemoryRouter>
      <DefaultAccessPanel options={grouped} />
    </MemoryRouter>,
  );
  const group = screen.getByRole('button', {
    name: 'Tables / Business / Sales',
  });
  expect(group).toHaveAttribute('aria-expanded', 'true');
  fireEvent.click(group);
  expect(screen.queryByRole('button', { name: 'Orders' })).toBeNull();
  fireEvent.click(group);
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Orders: Read' })).toBeEnabled(),
  );
  fireEvent.click(
    screen.getByRole('checkbox', {
      name: en.permissionWorkspace.configuredOnly,
    }),
  );
  expect(screen.queryByRole('button', { name: 'Notes' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Orders' })).toBeInTheDocument();
});

it('preserves other actions and retains the old scope when an inline save fails', async () => {
  const actions = [
    { action: 'read', scope: { type: 'all' } },
    { action: 'update', scope: { type: 'ids', ids: ['1'] } },
  ];
  authz.listDefaultAccess.mockResolvedValue([{ resource, actions }]);
  authz.setDefaultAccess.mockRejectedValue(new Error('Save failed'));
  render(
    <MemoryRouter>
      <DefaultAccessPanel options={options} />
    </MemoryRouter>,
  );
  const cell = screen.getByRole('button', { name: 'Orders: Read' });
  await waitFor(() =>
    expect(cell).toHaveAttribute('title', en.labels.allRecords),
  );
  fireEvent.click(cell);
  fireEvent.click(
    await screen.findByRole('menuitem', { name: en.defaultAccess.noDefault }),
  );
  await waitFor(() =>
    expect(authz.setDefaultAccess).toHaveBeenCalledWith({
      resource,
      actions: [actions[1]],
    }),
  );
  expect(await screen.findByText('Save failed')).toBeInTheDocument();
  expect(cell).toHaveAttribute('title', en.labels.allRecords);
});

it('switches resource types without mixing their resources or actions', async () => {
  const multi: AuthorizationOptions = {
    ...options,
    resourceTypes: [
      ...options.resourceTypes,
      {
        value: 'library',
        label: 'Libraries',
        resources: [{ value: 'docs', label: 'Documents' }],
        actions: [{ value: 'browse', label: 'Browse' }],
      },
    ],
  };
  render(
    <MemoryRouter>
      <DefaultAccessPanel options={multi} />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Libraries1' }));
  expect(screen.queryByRole('button', { name: 'Orders' })).toBeNull();
  expect(
    screen.getByRole('button', { name: 'Documents: Browse' }),
  ).toBeInTheDocument();
  expect(screen.queryByRole('columnheader', { name: 'Read' })).toBeNull();
});

it('labels the resource type sidebar without adding a synthetic table group', async () => {
  render(
    <MemoryRouter>
      <DefaultAccessPanel options={options} />
    </MemoryRouter>,
  );
  expect(
    screen.getByRole('navigation', { name: en.editors.resourceGroup }),
  ).toBeInTheDocument();
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Orders: Read' })).toBeEnabled(),
  );
  expect(
    screen.queryByRole('button', { name: 'Tables', expanded: true }),
  ).toBeNull();
});
