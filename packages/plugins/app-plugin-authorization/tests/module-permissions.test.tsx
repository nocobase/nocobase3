import { BulkPermissionToggle } from '../client/pages/permission-sets/bulk-permissions.js';
// @vitest-environment jsdom
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ResourceTypeList } from '../client/pages/permission-sets/resource-tree.js';
import { ModulePermissions } from '../client/pages/permission-sets/module-permissions.js';
import { resourceRows } from '../client/pages/permission-sets/resource-groups.js';
import { empty } from '../client/pages/permission-sets/drafts.js';
vi.mock('@nocobase/i18n/client', async () => {
  const { translate } = await import('./locale-harness.js');
  return { useTranslation: () => ({ t: translate }) };
});
const read = { value: 'read', label: 'Read' };
const test = { value: 'test', label: 'Send test email' };
const items = [
  { value: 'email', label: 'Email', group: 'system', actions: [read, test] },
  { value: 'audit', label: 'Audit', group: 'system', actions: [read] },
];
function Harness({ type = 'settings' }: { type?: string }) {
  const [draft, setDraft] = useState(empty);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  return (
    <>
      <ModulePermissions
        type={type}
        label='Settings'
        items={items}
        actions={[read, test]}
        rows={resourceRows(
          [{ value: 'system', label: 'System' }],
          items,
          collapsed,
        )}
        collapsed={collapsed}
        onCollapse={(id) =>
          setCollapsed(new Set(collapsed.has(id) ? [] : [id]))
        }
        draft={draft}
        disabled={false}
        filtered={false}
        onChange={setDraft}
        onToggle={(grant, action, mode) =>
          setDraft({
            ...draft,
            grants: [{ ...grant, actions: mode === 'all' ? [action] : [] }],
          })
        }
      />
      <output data-testid='grants'>
        {JSON.stringify(
          draft.grants.map(({ resource, actions }) => ({
            id: resource.id,
            actions,
          })),
        )}
      </output>
    </>
  );
}
it('renders module-specific actions and bulk-selects only supported actions even inside collapsed groups', () => {
  render(<Harness />);
  expect(
    screen.queryByRole('button', { name: 'Audit: Send test email' }),
  ).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole('button', { name: 'Email: Send test email' }),
  );
  expect(
    screen.getByRole('button', { name: 'Email: Send test email' }),
  ).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'System', exact: true }));
  expect(
    screen.queryByRole('button', { name: 'Email: Read' }),
  ).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole('button', { name: 'Select all', exact: true }),
  );
  expect(JSON.parse(screen.getByTestId('grants').textContent!)).toEqual([
    { id: 'email', actions: ['test', 'read'] },
    { id: 'audit', actions: ['read'] },
  ]);
});

it('renders custom business resources with only their own operations', () => {
  render(<Harness type='example.business' />);
  expect(
    screen.getByRole('button', { name: 'Email: Send test email' }),
  ).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Audit: Send test email' }),
  ).not.toBeInTheDocument();
});

it('marks only the resource types with granted resources as configured', () => {
  render(
    <ResourceTypeList
      types={[
        {
          value: 'business',
          section: 'business',
          sectionLabel: 'Business permissions',
          label: 'Business',
          actions: [],
          resources: [{ value: 'quotes', label: 'Quotes' }],
        },
        {
          value: 'settings',
          section: 'administration',
          sectionLabel: 'Administration',
          label: 'Settings',
          actions: [],
          resources: [{ value: 'workflow', label: 'Workflow' }],
        },
      ]}
      grants={[
        {
          id: 1,
          resource: { type: 'business', id: 'quotes' },
          actions: ['view'],
        },
      ]}
      type='business'
      label='Types'
      onSelect={() => {}}
    />,
  );
  expect(
    screen
      .getByRole('button', { name: 'Business' })
      .querySelector('[role="img"]'),
  ).not.toBeNull();
  expect(
    screen
      .getByRole('button', { name: 'Settings' })
      .querySelector('[role="img"]'),
  ).toBeNull();
  expect(screen.getByText('Administration')).toBeVisible();
});

it('keeps an all-selected bulk indicator limited when an operation has a restricted scope', () => {
  render(
    <BulkPermissionToggle
      items={[
        {
          value: 'orders',
          label: 'Orders',
          actions: [read],
          dataScopes: {
            read: [
              {
                key: 'orders',
                label: 'Orders',
                collection: 'orders',
                collectionFields: [],
                defaultValue: '',
                options: [],
              },
            ],
          },
        },
      ]}
      actions={[read]}
      type='business'
      draft={{
        ...empty(),
        grants: [
          {
            id: 1,
            resource: { type: 'business', id: 'orders' },
            actions: ['read'],
            policies: {
              read: { type: 'business', scopes: { orders: 'recordsIOwn' } },
            },
          },
        ],
      }}
      disabled={false}
      label='Select all'
      onChange={() => {}}
    />,
  );
  expect(screen.getByRole('button', { name: 'Select all' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(
    screen.getByRole('img', { name: 'Limited access' }),
  ).toBeInTheDocument();
});
