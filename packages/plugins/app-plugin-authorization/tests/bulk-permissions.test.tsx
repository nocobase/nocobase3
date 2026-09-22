// @vitest-environment jsdom
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
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
  collections: [],
  recordAccessPolicies: [],
  subjectTypes: [],
  resourceTypes: [
    {
      value: 'page',
      label: 'Pages',
      actions: [{ value: 'access', label: 'Access' }],
      groups: [
        {
          value: 'business',
          label: 'Business',
          children: [{ value: 'sales', label: 'Sales' }],
        },
      ],
      resources: [
        { value: 'orders', label: 'Orders', group: 'sales' },
        { value: 'reports', label: 'Reports', group: 'business' },
        { value: 'home', label: 'Home' },
        { value: 'blocked', label: 'Blocked', actions: [] },
      ],
    },
  ],
};
function Harness() {
  const [draft, setDraft] = useState<Draft>({
    originalKey: 'staff',
    key: 'staff',
    title: 'Staff',
    grants: [
      {
        id: 1,
        resource: { type: 'settings', id: 'existing' },
        actions: ['read'],
      },
    ],
  });
  return (
    <>
      <output data-testid='draft'>{JSON.stringify(draft.grants)}</output>
      <PermissionSetEditor
        dirty={true}
        options={options}
        draft={draft}
        busy={false}
        onChange={setDraft}
        onClose={() => {}}
        onSave={async (event) => {
          event.preventDefault();
        }}
      />
    </>
  );
}
describe('bulk simple permissions', () => {
  it('includes collapsed descendants and marks partial selections', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Sales', exact: true }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Access: Select all in Business' }),
    );
    expect(
      screen.getByRole('button', { name: 'Access: Select all in Business' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('button', { name: 'Access: Select all', exact: true }),
    ).toHaveAttribute('aria-pressed', 'mixed');
    expect(screen.getByTestId('draft')).toHaveTextContent('orders');
    expect(screen.getByTestId('draft')).toHaveTextContent('reports');
    expect(screen.getByTestId('draft')).toHaveTextContent('existing');
    expect(screen.getByTestId('draft')).not.toHaveTextContent('blocked');
    fireEvent.click(
      screen.getByRole('button', { name: 'Access: Select all in Business' }),
    );
    expect(screen.getByTestId('draft')).not.toHaveTextContent('orders');
    expect(screen.getByTestId('draft')).toHaveTextContent('existing');
  });
  it('selects all eligible resources and limits filtered selection to matches', () => {
    render(<Harness />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Access: Select all', exact: true }),
    );
    expect(
      screen.getByRole('button', { name: 'Access: Select all', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('draft')).toHaveTextContent('home');
    expect(screen.getByTestId('draft')).not.toHaveTextContent('blocked');
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Search resources' }),
      { target: { value: 'Orders' } },
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Access: Select matching resources' }),
    );
    expect(screen.getByTestId('draft')).not.toHaveTextContent('orders');
    expect(screen.getByTestId('draft')).toHaveTextContent('reports');
    expect(screen.getByTestId('draft')).toHaveTextContent('home');
  });
});
