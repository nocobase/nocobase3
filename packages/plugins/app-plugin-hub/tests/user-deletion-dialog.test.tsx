import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDeleteDialog } from '../../app-plugin-users/client/pages/users-page.js';
import enUS from '../../app-plugin-users/client/locales/en-US.js';
vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({
    t: (key: string, values?: { name?: string }) => {
      const resource = enUS as Record<string, unknown>;
      let result: unknown = resource[key];
      if (!Object.hasOwn(resource, key)) {
        result = resource;
        for (const part of key.split('.'))
          result = (result as Record<string, unknown>)[part];
      }
      return String(result).replace('{{name}}', values?.name ?? '');
    },
  }),
}));
const user = {
  id: 'target',
  name: 'Test user',
  email: 'test@example.com',
  emailVerified: false,
  disabledAt: null,
  createdAt: '',
  updatedAt: '',
  roleScopes: {},
};
describe('Delete user confirmation', () => {
  it('describes credential revocation and waits for explicit confirmation', () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(
      <ConfirmDeleteDialog
        user={user}
        busy={false}
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    );
    expect(
      screen.getByText(/All sessions and API Keys will be revoked/),
    ).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete user' }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
  it('prevents duplicate confirmation while deletion is pending', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDeleteDialog
        user={user}
        busy
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Delete user' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete user' }));
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
