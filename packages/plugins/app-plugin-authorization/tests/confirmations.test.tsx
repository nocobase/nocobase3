// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@nocobase/i18n/client', async () => {
  const { translate } = await import('./locale-harness.js');
  return { useTranslation: () => ({ t: translate }) };
});

import type { AuthorizationOptions } from '../client/authorization-client.js';
import { permissionSetCapabilities } from '../client/components/permission-set-access.js';
import { userDirectory } from '../client/components/user-directory.js';
import { PermissionSetDetail } from '../client/pages/permission-sets/detail.js';
import type { Draft } from '../client/pages/permission-sets/types.js';
import { translate } from './locale-harness.js';

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

  it('does nothing when the confirmation is cancelled', () => {
    const onDelete = vi.fn();
    renderDetail(onDelete);

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

  it('deletes once the confirmation is accepted', () => {
    const onDelete = vi.fn();
    renderDetail(onDelete);

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
