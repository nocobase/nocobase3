import { selectOption } from './select-option.js';
// @vitest-environment jsdom
import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
vi.mock('@nocobase/i18n/client', async () => {
  const { translate } = await import('./locale-harness.js');
  return { useTranslation: () => ({ t: translate }) };
});
import { PermissionSetEditor } from '../client/pages/permission-sets/editor.js';
import type { AuthorizationOptions } from '../client/authorization-client.js';
import type { Draft } from '../client/pages/permission-sets/types.js';
const options: AuthorizationOptions = {
  plugins: [],
  subjectTypes: [],
  recordAccessPolicies: [],
  collections: [],
  resourceTypes: [
    {
      value: 'settings',
      label: 'Settings',
      actions: [{ value: 'read', label: 'Read' }],
      resources: [
        { value: 'authorization.permission-sets', label: 'Permission sets' },
      ],
    },
    {
      value: 'database.collection',
      label: 'Collections',
      actions: [{ value: 'read', label: 'Read' }],
      resources: [{ value: 'orders', label: 'Orders' }],
    },
  ],
};
function Harness({ database = false }: { database?: boolean }) {
  const [draft, setDraft] = useState<Draft>({
    originalKey: 'staff',
    key: 'staff',
    title: 'Staff',
    grants: database
      ? [
          {
            id: 1,
            resource: { type: 'database.collection', id: 'orders' },
            actions: ['read'],
            database: {
              read: { input: '*', output: ['id'], recordAccess: 'allRecords' },
            },
          },
        ]
      : [],
  });
  return (
    <PermissionSetEditor
      options={options}
      draft={draft}
      busy={false}
      onChange={setDraft}
      onClose={() => {}}
      onSave={(event) => {
        event.preventDefault();
        return Promise.resolve();
      }}
    />
  );
}
describe('scope controls', () => {
  it('toggles simple permissions directly with no menu', () => {
    render(<Harness />);
    const button = screen.getByRole('button', {
      name: 'Permission sets: Read',
    });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'false');
  });
  it('edits scope in one popover without a permanent configuration panel', async () => {
    render(<Harness database />);
    expect(
      screen.getByRole('button', { name: 'Settings', exact: true }),
    ).toHaveAttribute('aria-current', 'true');
    expect(
      screen.queryByRole('button', { name: 'Orders: Read' }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Collections', exact: true }),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Orders: Read' }));
    const popup = await screen.findByRole('dialog');
    expect(popup).toHaveTextContent('Orders · Read');
    expect(
      screen.getByRole('button', { name: 'Custom scope' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Full access', exact: true }),
    );
    expect(popup).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Full access', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.queryByRole('region', { name: 'Fields users can view' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Custom scope' }));
    expect(
      screen.getByRole('region', { name: 'Fields users can view' }),
    ).toBeVisible();
    await selectOption(
      screen.getByRole('combobox', {
        name: 'Fields users can view: Field selection',
      }),
      'Specific fields',
    );
    expect(
      screen.getByRole('region', { name: 'Fields users can view' }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Custom scope' }),
    ).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(
      screen.getByRole('button', { name: 'No access', exact: true }),
    );
    expect(
      screen.getByRole('button', { name: 'No access', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    fireEvent.keyDown(popup, { key: 'Escape' });
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Orders: Read' }));
    await screen.findByRole('dialog');
    expect(
      screen.getByRole('button', { name: 'No access', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
  });
});
