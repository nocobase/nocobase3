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
  subjectTypes: [],
  recordAccessPolicies: [],
  collections: [],
  resourceTypes: [
    {
      value: 'resource',
      label: 'Administration',
      groups: [
        {
          value: 'administration',
          label: 'Administration',
          category: 'administration',
        },
      ],
      actions: [{ value: 'read', label: 'Read' }],
      resources: [
        {
          value: 'authorization.permission-sets',
          label: 'Permission sets',
          group: 'administration',
        },
      ],
    },
  ],
};
function Harness() {
  const [draft, setDraft] = useState<Draft>({
    originalKey: 'staff',
    key: 'staff',
    title: 'Staff',
    grants: [],
  });
  return (
    <PermissionSetEditor
      dirty={true}
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
});

it('edits page entry independently from a business resource with the same ID', () => {
  const options: AuthorizationOptions = {
    plugins: [],
    subjectTypes: [],
    recordAccessPolicies: [],
    collections: [],
    resourceTypes: [
      {
        value: 'resource',
        label: 'Business',
        groups: [{ value: 'sales', label: 'Sales', category: 'business' }],
        actions: [{ value: 'view', label: 'View' }],
        resources: [{ value: 'orders', group: 'sales', label: 'Orders' }],
      },
      {
        value: 'page',
        label: 'Pages',
        category: 'pages',
        actions: [{ value: 'access', label: 'Access' }],
        resources: [{ value: 'orders', label: 'Orders' }],
      },
    ],
  };
  let current: Draft = {
    originalKey: 'staff',
    key: 'staff',
    title: 'Staff',
    grants: [
      {
        id: 1,
        resource: { type: 'resource', id: 'orders' },
        actions: ['view'],
      },
    ],
  };
  function Editor() {
    const [draft, setDraft] = useState(current);
    return (
      <PermissionSetEditor
        dirty={true}
        options={options}
        draft={draft}
        busy={false}
        onChange={(next) => {
          current = next;
          setDraft(next);
        }}
        onClose={() => {}}
        onSave={async () => {}}
      />
    );
  }
  render(<Editor />);
  expect(
    screen.getByRole('button', { name: 'Pages', exact: true }),
  ).toHaveAttribute('aria-current', 'true');
  expect(
    screen
      .getAllByRole('group', { name: 'Orders' })[0]
      .querySelectorAll('button'),
  ).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Sales', exact: true }));
  expect(screen.getByRole('button', { name: 'Orders: View' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Pages', exact: true }));
  const access = screen.getByRole('button', { name: 'Orders: Access' });
  expect(access).toHaveAttribute('aria-pressed', 'false');
  fireEvent.click(access);
  expect(
    current.grants.find((grant) => grant.resource.type === 'page')?.actions,
  ).toEqual(['access']);
  expect(
    current.grants.find((grant) => grant.resource.type === 'resource')?.actions,
  ).toEqual(['view']);
  fireEvent.click(access);
  expect(
    current.grants.find((grant) => grant.resource.type === 'page'),
  ).toBeUndefined();
  expect(
    current.grants.find((grant) => grant.resource.type === 'resource')?.actions,
  ).toEqual(['view']);
});
