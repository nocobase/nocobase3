vi.mock(
  '../../../plugins/app-plugin-authz-restriction-rules/client/api.js',
  () => ({
    useRestrictionRulesClient: () => authz,
  }),
);
vi.mock(
  '../../../plugins/app-plugin-authz-sharing-rules/client/api.js',
  () => ({
    useSharingRulesClient: () => authz,
  }),
);
vi.mock(
  '../../../plugins/app-plugin-authz-default-access/client/api.js',
  () => ({
    useDefaultAccessClient: () => authz,
  }),
);
// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';
import type { AuthorizationOptions } from '../../../plugins/app-plugin-authorization/client/authorization-client.js';
import {
  subsection,
  withSubsections,
} from '../../../plugins/app-plugin-authorization/tests/helpers/workspace-options.js';
const authz = vi.hoisted(() => ({
  can: vi.fn(async () => true),
  revision: () => 0,
  onInvalidated: vi.fn(() => () => {}),
  listDefaultAccess: vi.fn(),
  listDefaultAccessRecords: vi.fn(),
  createDefaultAccess: vi.fn(),
  updateDefaultAccess: vi.fn(),
  deleteDefaultAccess: vi.fn(),
  listRestrictionRules: vi.fn(),
  listRestrictionRecords: vi.fn(),
  listSharingRules: vi.fn(),
  listSharingRecords: vi.fn(),
}));
vi.mock(
  '../../../plugins/app-plugin-authorization/client/use-authorization-client.js',
  () => ({
    useAuthorizationClient: () => authz,
  }),
);
vi.mock('@nocobase/i18n/client', async () => {
  const { translate } = await import('./locale-harness.js');
  return { useTranslation: () => ({ t: translate }) };
});
import { DefaultAccessPanel } from '../../../plugins/app-plugin-authz-default-access/client/pages/default-access-panel.js';
import { RestrictionRulesPanel } from '../../../plugins/app-plugin-authz-restriction-rules/client/pages/restriction-rules-panel.js';
import { SharingRulesPanel } from '../../../plugins/app-plugin-authz-sharing-rules/client/pages/sharing-rules-panel.js';
import en from './rule-locales.js';
const resource = { type: 'database.collection', id: 'orders' };
const read = { value: 'read', label: 'Read' };
const tables = subsection('administration.tables', 'Tables', [
  { type: resource.type, value: 'orders', label: 'Orders', actions: [read] },
]);
const options: AuthorizationOptions = {
  sections: withSubsections({ administration: [tables] }),
  subjectTypes: [],
  collections: [{ name: 'orders', fields: ['id', 'name'] }],
  recordAccess: [],
};
function Location() {
  return <output data-testid='location'>{useLocation().search}</output>;
}
beforeEach(() => {
  vi.resetAllMocks();
  authz.listDefaultAccess.mockResolvedValue([]);
  authz.listDefaultAccessRecords.mockResolvedValue([]);
  authz.createDefaultAccess.mockResolvedValue(undefined);
  authz.updateDefaultAccess.mockResolvedValue(undefined);
  authz.deleteDefaultAccess.mockResolvedValue(undefined);
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
    expect(authz.createDefaultAccess).toHaveBeenCalledWith({
      key: 'database.collection.orders',
      resource,
      actions: [{ action: 'read', selection: { type: 'all' } }],
    }),
  );
  expect(screen.queryByRole('dialog')).toBeNull();
});
it('preserves other actions and retains the old scope when an inline save fails', async () => {
  const actions = [
    { action: 'read', selection: { type: 'all' } },
    { action: 'update', selection: { type: 'records', ids: ['1'] } },
  ];
  authz.listDefaultAccess.mockResolvedValue([
    { key: 'orders-default', resource, actions },
  ]);
  authz.updateDefaultAccess.mockRejectedValue(new Error('Save failed'));
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
    expect(authz.updateDefaultAccess).toHaveBeenCalledWith('orders-default', {
      key: 'orders-default',
      resource,
      actions: [actions[1]],
    }),
  );
  expect(await screen.findByText('Save failed')).toBeInTheDocument();
  expect(cell).toHaveAttribute('title', en.labels.allRecords);
});

it('switches subsections without mixing their resources or actions', async () => {
  const multi: AuthorizationOptions = {
    ...options,
    sections: withSubsections({
      administration: [
        tables,
        subsection('administration.libraries', 'Libraries', [
          {
            type: 'library',
            value: 'docs',
            label: 'Documents',
            actions: [{ value: 'browse', label: 'Browse' }],
          },
        ]),
      ],
    }),
  };
  render(
    <MemoryRouter>
      <DefaultAccessPanel options={multi} />
      <Location />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Libraries1' }));
  expect(screen.queryByRole('button', { name: 'Orders' })).toBeNull();
  expect(
    screen.getByRole('button', { name: 'Documents: Browse' }),
  ).toBeInTheDocument();
  expect(screen.queryByRole('columnheader', { name: 'Read' })).toBeNull();
  expect(screen.getByTestId('location')).toHaveTextContent(
    '?section=administration.libraries',
  );
});

it.each(['sharing', 'restriction'] as const)(
  'disables creation and ignores a new-rule URL when %s resources are absent',
  async (kind) => {
    authz.listSharingRules.mockResolvedValue([]);
    authz.listRestrictionRules.mockResolvedValue([]);
    const Panel =
      kind === 'sharing' ? SharingRulesPanel : RestrictionRulesPanel;
    const labels = kind === 'sharing' ? en.sharingRules : en.restrictionRules;
    render(
      <MemoryRouter initialEntries={['/?new=1']}>
        <Panel options={{ ...options, sections: withSubsections({}) }} />
      </MemoryRouter>,
    );
    expect(await screen.findByText(labels.noResources)).toBeVisible();
    expect(screen.getByRole('button', { name: labels.create })).toBeDisabled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('database.collection')).not.toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText('read, create, update'),
    ).not.toBeInTheDocument();
  },
);
