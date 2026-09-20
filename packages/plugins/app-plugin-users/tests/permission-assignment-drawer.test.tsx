// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import type {
  ManagedUser,
  UserRoleScopeOption,
} from '../client/user-client.js';
import { PermissionAssignmentDrawer } from '../client/components/permission-assignment-drawer.js';
vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
afterEach(cleanup);
const user = {
  name: 'Alice',
  email: 'alice@example.test',
  roleScopes: { app: ['member', 'root'] },
} as unknown as ManagedUser;
const scope: UserRoleScopeOption = {
  key: 'app',
  label: 'Permission sets',
  selection: 'multiple',
  requiredOnCreate: false,
  options: [
    { value: 'member', label: 'Member' },
    { value: 'export', label: 'Exporter' },
    { value: 'root', label: 'Root', removable: false, assignable: false },
  ],
};
it('keeps selections local until saved and preserves protected grants', async () => {
  const save = vi.fn().mockResolvedValue(undefined);
  render(
    <PermissionAssignmentDrawer
      user={user}
      scope={scope}
      onClose={vi.fn()}
      onSave={save}
    />,
  );
  const interaction = userEvent.setup();
  await interaction.type(screen.getByRole('textbox'), 'Exporter');
  await interaction.click(screen.getByRole('checkbox', { name: 'Exporter' }));
  expect(save).not.toHaveBeenCalled();
  await interaction.clear(screen.getByRole('textbox'));
  expect(
    (
      screen.getByRole('checkbox', { name: /Root/ }) as HTMLInputElement
    ).getAttribute('aria-disabled') === 'true' ||
      screen.getByRole('checkbox', { name: /Root/ }).hasAttribute('disabled'),
  ).toBe(true);
  await interaction.click(screen.getByRole('button', { name: 'form.save' }));
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith(['member', 'root', 'export']),
  );
});
it('keeps the draft after a failed save and requires explicit discard', async () => {
  const close = vi.fn();
  render(
    <PermissionAssignmentDrawer
      user={user}
      scope={scope}
      onClose={close}
      onSave={vi.fn().mockRejectedValue(new Error('failed'))}
    />,
  );
  const interaction = userEvent.setup();
  await interaction.click(screen.getByRole('checkbox', { name: 'Exporter' }));
  await interaction.click(screen.getByRole('button', { name: 'form.save' }));
  expect(await screen.findByRole('alert')).toBeDefined();
  expect(
    screen
      .getByRole('checkbox', { name: 'Exporter' })
      .getAttribute('aria-checked'),
  ).toBe('true');
  await interaction.click(screen.getByRole('button', { name: 'form.cancel' }));
  expect(close).not.toHaveBeenCalled();
  await interaction.click(
    screen.getByRole('button', { name: 'assignment.discardChanges' }),
  );
  expect(close).toHaveBeenCalledOnce();
});
