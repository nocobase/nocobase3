// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { AuthorizationOptions } from '../client/authorization-client.js';
import { permissionSetCapabilities } from '../client/components/permission-set-access.js';
import { userDirectory } from '../client/components/user-directory.js';
import { PermissionSetDetail } from '../client/pages/permission-sets/detail.js';
import type { Draft } from '../client/pages/permission-sets/types.js';

const options: AuthorizationOptions = {
  plugins: [],
  resourceTypes: [],
  subjectTypes: [],
  collections: [],
  recordAccessPolicies: [],
};

const draft: Draft = {
  originalKey: 'order-ops',
  key: 'order-ops',
  title: 'Order operators',
  grants: [],
};

function renderDetail(onDelete: () => void): void {
  render(
    <PermissionSetDetail
      assignments={[]}
      busy={false}
      capabilities={permissionSetCapabilities()}
      directory={userDirectory([])}
      draft={draft}
      options={options}
      section='permissions'
      onAssign={() => Promise.resolve()}
      onBack={() => undefined}
      onDelete={onDelete}
      onEdit={() => undefined}
      onRevoke={() => Promise.resolve()}
      onSection={() => undefined}
    />,
  );
}

describe('destructive actions', () => {
  it('asks before deleting a permission set and names it', () => {
    const onDelete = vi.fn();
    renderDetail(onDelete);

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(onDelete).not.toHaveBeenCalled();
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByText('Delete this permission set?')).toBeInTheDocument();
    expect(dialog.getByText(/Order operators/)).toBeInTheDocument();
    expect(dialog.getByText(/cannot be undone/)).toBeInTheDocument();
  });

  it('does nothing when the confirmation is cancelled', () => {
    const onDelete = vi.fn();
    renderDetail(onDelete);

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.queryByText('Delete this permission set?')).toBeNull();
  });

  it('deletes once the confirmation is accepted', () => {
    const onDelete = vi.fn();
    renderDetail(onDelete);

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Delete permission set' }),
    );

    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
