// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@nocobase/i18n/client', async () => {
  const { translate } = await import('./locale-harness.js');
  return { useTranslation: () => ({ t: translate }) };
});

import { MemoryRouter, Route, Routes } from 'react-router';
import { PermissionSetsPanel } from '../client/pages/permission-sets/panel.js';
import EditPage from '../client/pages/permission-set-edit-page.js';
import { translate } from './locale-harness.js';

const api = vi.hoisted(() => ({
  can: vi.fn(async () => true),
  getPermissionsRevision: () => 0,
  onPermissionsInvalidated: vi.fn(() => () => {}),
  listPermissionSets: vi.fn(),
  deletePermissionSet: vi.fn(),
  invalidatePermissions: vi.fn(),
}));
vi.mock('../client/use-authorization-client.js', () => ({
  useAuthorizationClient: () => api,
}));

async function renderDetail(onDelete: () => void): Promise<void> {
  api.listPermissionSets.mockResolvedValue([
    { key: 'order-ops', title: 'Order operators', grants: [] },
  ]);
  api.deletePermissionSet.mockImplementation(onDelete);
  render(
    <MemoryRouter initialEntries={['/sets/edit/order-ops']}>
      <Routes>
        <Route
          path='/sets'
          element={
            <PermissionSetsPanel
              options={{
                plugins: [],
                resourceTypes: [],
                subjectTypes: [],
                collections: [],
                recordAccessPolicies: [],
              }}
            />
          }
        >
          <Route path='edit/:permissionSetKey' element={<EditPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
  await screen.findByRole('button', { name: 'Order operators' });
}

describe('destructive actions', () => {
  it('asks before deleting a permission set and names it', async () => {
    const onDelete = vi.fn();
    await renderDetail(onDelete);

    fireEvent.click(
      screen.getByRole('button', { name: translate('common.delete') }),
    );

    expect(onDelete).not.toHaveBeenCalled();
    const dialog = within(screen.getByRole('dialog'));
    expect(
      dialog.getByText(translate('permissionSets.detail.confirmDeleteTitle')),
    ).toBeInTheDocument();
    expect(
      dialog.getByText(
        translate('permissionSets.detail.confirmDeleteBody', {
          title: 'Order operators',
        }),
      ),
    ).toBeInTheDocument();
  });

  it('does nothing when the confirmation is cancelled', async () => {
    const onDelete = vi.fn();
    await renderDetail(onDelete);

    fireEvent.click(
      screen.getByRole('button', { name: translate('common.delete') }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: translate('common.cancel') }),
    );

    expect(onDelete).not.toHaveBeenCalled();
    expect(
      screen.queryByText(translate('permissionSets.detail.confirmDeleteTitle')),
    ).toBeNull();
  });

  it('deletes once the confirmation is accepted', async () => {
    const onDelete = vi.fn();
    await renderDetail(onDelete);

    fireEvent.click(
      screen.getByRole('button', { name: translate('common.delete') }),
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: translate('permissionSets.detail.confirmDelete'),
      }),
    );

    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
